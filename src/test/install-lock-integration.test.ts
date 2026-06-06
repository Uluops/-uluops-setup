/**
 * True OS-level concurrency test for the install lock.
 *
 * Unit tests in install-lock.test.ts exercise the logic in-process. This file
 * spawns two real child Node processes that both try to acquire the same lock
 * and asserts exactly one wins. The other receives an InstallLockHeldError.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

let tmpDir: string;
let lockDir: string;
let scriptPath: string;

const PROJECT_ROOT = resolve(__dirname, "..", "..");
const COMPILED_LOCK_MODULE = join(
  PROJECT_ROOT,
  "dist",
  "lib",
  "install-lock.js",
);

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "uluops-lock-int-"));
  lockDir = join(tmpDir, "install.lock");
  scriptPath = join(tmpDir, "acquire-and-hold.mjs");

  // A tiny script that acquires the lock, holds it for ~600ms, releases, and
  // exits 0. On lock-held failure, prints LOCK_HELD and exits 2.
  const script = `
import { acquireInstallLock, InstallLockHeldError } from "${COMPILED_LOCK_MODULE.replace(/\\/g, "\\\\")}";

const lockDir = process.argv[2];
const holdMs = Number(process.argv[3]) || 600;

try {
  const handle = await acquireInstallLock({ lockDir, waitMs: 0 });
  console.log("ACQUIRED:" + process.pid);
  await new Promise((r) => setTimeout(r, holdMs));
  await handle.release();
  console.log("RELEASED:" + process.pid);
  process.exit(0);
} catch (err) {
  if (err instanceof InstallLockHeldError) {
    console.log("LOCK_HELD:" + JSON.stringify(err.holder));
    process.exit(2);
  }
  console.error("UNEXPECTED:" + err.message);
  process.exit(3);
}
`;
  await writeFile(scriptPath, script);
});

afterEach(async () => {
  try {
    await rm(tmpDir, { recursive: true, force: true });
  } catch {
    // Best-effort.
  }
});

interface ChildResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

function runChild(holdMs: number, delayMs = 0): Promise<ChildResult> {
  return new Promise((resolveResult, rejectResult) => {
    const start = (): void => {
      const child = spawn(
        process.execPath,
        [scriptPath, lockDir, String(holdMs)],
        { stdio: ["ignore", "pipe", "pipe"] },
      );
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (d) => {
        stdout += String(d);
      });
      child.stderr.on("data", (d) => {
        stderr += String(d);
      });
      child.on("error", rejectResult);
      child.on("exit", (code) => {
        resolveResult({ code, stdout, stderr });
      });
    };
    if (delayMs > 0) setTimeout(start, delayMs);
    else start();
  });
}

describe("install-lock OS-level concurrency", () => {
  it("two concurrent child processes serialize — one acquires, one gets InstallLockHeldError", async () => {
    // First child holds the lock for ~600ms. Second child starts 100ms later
    // (lock is held), waitMs=0 → fails fast.
    const [first, second] = await Promise.all([
      runChild(600, 0),
      runChild(600, 100),
    ]);

    // Exactly one acquired, one was held.
    const outcomes = [first, second].map((r) => ({
      acquired: r.stdout.includes("ACQUIRED:"),
      held: r.stdout.includes("LOCK_HELD:"),
      code: r.code,
    }));

    const acquiredCount = outcomes.filter((o) => o.acquired).length;
    const heldCount = outcomes.filter((o) => o.held).length;
    expect(acquiredCount).toBe(1);
    expect(heldCount).toBe(1);

    // The losing child exited 2 (InstallLockHeldError); winner exited 0.
    const winner = outcomes.find((o) => o.acquired);
    const loser = outcomes.find((o) => o.held);
    expect(winner?.code).toBe(0);
    expect(loser?.code).toBe(2);
  }, 15_000);
});
