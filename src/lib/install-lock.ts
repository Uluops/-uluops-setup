/**
 * Process-level mutex for uluops-setup install/uninstall operations.
 *
 * Solves the TOCTOU race surfaced by ship-pipeline code-auditor (AF-006):
 * two concurrent `npx @uluops/setup` invocations both read shared state,
 * each merges and writes its own version, second write clobbers first.
 *
 * Uses `mkdir` atomicity (POSIX + NTFS, ~50 years stable) instead of a
 * dependency. Meta file inside the lock dir carries PID + hostname +
 * start timestamp so stale locks can be reclaimed automatically.
 *
 * Scope is intentionally narrow: this protects setup-vs-setup races only.
 * Setup-vs-harness races (the harness CLI writing to its own settings file
 * concurrently) require a separate compare-and-swap design.
 */

import {
  mkdir,
  readFile,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import { rmSync } from "node:fs";
import { hostname } from "node:os";
import { join } from "node:path";
import { getInstallLockDir } from "./paths.js";

const META_FILENAME = "meta.json";
const DEFAULT_MAX_AGE_MS = 30 * 60 * 1000; // 30 min
const DEFAULT_WAIT_MS = 0;
const POLL_INTERVAL_MS = 500;

export interface LockHandle {
  release(): Promise<void>;
}

export interface AcquireOptions {
  /** Max time a held lock is considered valid before being reclaimed (default 30 min). */
  maxAgeMs?: number;
  /** How long to wait for a held lock before failing (default 0). */
  waitMs?: number;
  /** Override the lock directory (test seam). */
  lockDir?: string;
}

interface LockMeta {
  pid: number;
  hostname: string;
  startedAt: number;
}

/** Thrown when another process holds the lock and waiting has exhausted. */
export class InstallLockHeldError extends Error {
  constructor(
    public readonly holder: {
      pid: number;
      hostname: string;
      ageMs: number;
    },
  ) {
    super(
      `Another uluops-setup process is already running (PID ${holder.pid} on ${holder.hostname}, started ${Math.round(holder.ageMs / 1000)}s ago).`,
    );
    this.name = "InstallLockHeldError";
  }
}

/**
 * Acquire the install lock. Resolves with a handle whose `release()` must be
 * called in a `finally` block. Throws `InstallLockHeldError` if the lock is
 * held by a live process and waiting (if any) has exhausted.
 */
export async function acquireInstallLock(
  opts: AcquireOptions = {},
): Promise<LockHandle> {
  const lockDir = opts.lockDir ?? getInstallLockDir();
  const maxAgeMs = opts.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
  const waitMs = opts.waitMs ?? DEFAULT_WAIT_MS;

  const deadline = Date.now() + waitMs;

  // First try (and one retry after stale-lock reclaim).
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await mkdir(lockDir, { recursive: false });
      // Won the race. Write metadata, register handlers, return handle.
      const meta: LockMeta = {
        pid: process.pid,
        hostname: hostname(),
        startedAt: Date.now(),
      };
      await writeFile(join(lockDir, META_FILENAME), JSON.stringify(meta));
      return registerHandle(lockDir);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== "EEXIST") throw err;
    }

    // Lock exists. Inspect it.
    const verdict = await inspectHeldLock(lockDir, maxAgeMs);
    if (verdict.kind === "stale") {
      // Reclaim and retry once.
      await rm(lockDir, { recursive: true, force: true });
      continue;
    }

    // Live holder. Optionally wait.
    if (Date.now() < deadline) {
      while (Date.now() < deadline) {
        await sleep(POLL_INTERVAL_MS);
        const recheck = await inspectHeldLock(lockDir, maxAgeMs);
        if (recheck.kind === "stale") {
          // Holder released or died during wait.
          break;
        }
      }
      // Retry once after wait.
      continue;
    }

    throw new InstallLockHeldError({
      pid: verdict.meta.pid,
      hostname: verdict.meta.hostname,
      ageMs: Date.now() - verdict.meta.startedAt,
    });
  }

  // Both attempts exhausted without acquiring.
  throw new InstallLockHeldError({ pid: -1, hostname: "unknown", ageMs: 0 });
}

type Verdict =
  | { kind: "live"; meta: LockMeta }
  | { kind: "stale"; reason: string };

async function inspectHeldLock(
  lockDir: string,
  maxAgeMs: number,
): Promise<Verdict> {
  const metaPath = join(lockDir, META_FILENAME);
  let raw: string;
  try {
    raw = await readFile(metaPath, "utf-8");
  } catch {
    // Lock dir exists but meta missing or unreadable — treat as stale.
    return { kind: "stale", reason: "missing-meta" };
  }

  let meta: LockMeta;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isLockMeta(parsed)) {
      return { kind: "stale", reason: "malformed-meta" };
    }
    meta = parsed;
  } catch {
    return { kind: "stale", reason: "invalid-json" };
  }

  if (Date.now() - meta.startedAt > maxAgeMs) {
    return { kind: "stale", reason: "timeout" };
  }

  // Same host: probe the PID. Different host: trust the meta until timeout.
  if (meta.hostname === hostname()) {
    if (!isPidAlive(meta.pid)) {
      return { kind: "stale", reason: "dead-pid" };
    }
  }

  return { kind: "live", meta };
}

function isLockMeta(value: unknown): value is LockMeta {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v["pid"] === "number" &&
    typeof v["hostname"] === "string" &&
    typeof v["startedAt"] === "number"
  );
}

function isPidAlive(pid: number): boolean {
  if (pid <= 0 || !Number.isInteger(pid)) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ESRCH") return false;
    if (code === "EPERM") return true; // exists but we lack permission
    return false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Signal handler registry ─────────────────────────────────────────────────
//
// All active lock dirs are tracked at module scope so signal handlers can
// release every held lock synchronously before re-raising the signal.

const heldLockDirs = new Set<string>();
let signalHandlersInstalled = false;
let installedSigintHandler: ((signal: NodeJS.Signals) => void) | null = null;
let installedSigtermHandler: ((signal: NodeJS.Signals) => void) | null = null;
let installedUncaughtHandler: ((err: Error) => void) | null = null;

function registerHandle(lockDir: string): LockHandle {
  heldLockDirs.add(lockDir);
  ensureSignalHandlers();

  let released = false;
  return {
    async release(): Promise<void> {
      if (released) return;
      released = true;
      heldLockDirs.delete(lockDir);
      try {
        await unlink(join(lockDir, META_FILENAME));
      } catch {
        // Already gone or unreadable; proceed to rmdir.
      }
      try {
        await rm(lockDir, { recursive: true, force: true });
      } catch {
        // Best-effort; do not throw from release().
      }
    },
  };
}

function ensureSignalHandlers(): void {
  if (signalHandlersInstalled) return;
  signalHandlersInstalled = true;

  const cleanup = (signal: NodeJS.Signals): void => {
    for (const dir of heldLockDirs) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // Best-effort.
      }
    }
    heldLockDirs.clear();
    // Re-raise the signal so default Node behavior runs (exit with the
    // conventional 128 + signum code). Listeners were already triggered.
    process.removeListener(signal, cleanup);
    process.kill(process.pid, signal);
  };

  const uncaught = (err: Error): void => {
    for (const dir of heldLockDirs) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // Best-effort.
      }
    }
    heldLockDirs.clear();
    // Restore default behavior: print stack and exit 1.
    console.error(err);
    process.exit(1);
  };

  installedSigintHandler = cleanup;
  installedSigtermHandler = cleanup;
  installedUncaughtHandler = uncaught;

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
  process.on("uncaughtException", uncaught);
}

// ─── Test seams ──────────────────────────────────────────────────────────────

/** Test-only: detach handlers and clear lock-dir tracking so tests can rebind. */
export function __resetSignalHandlersForTesting(): void {
  if (installedSigintHandler) {
    process.removeListener("SIGINT", installedSigintHandler);
    installedSigintHandler = null;
  }
  if (installedSigtermHandler) {
    process.removeListener("SIGTERM", installedSigtermHandler);
    installedSigtermHandler = null;
  }
  if (installedUncaughtHandler) {
    process.removeListener("uncaughtException", installedUncaughtHandler);
    installedUncaughtHandler = null;
  }
  signalHandlersInstalled = false;
  heldLockDirs.clear();
}
