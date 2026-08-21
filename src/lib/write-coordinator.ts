/**
 * Per-file write coordinator.
 *
 * Two jobs, one choke point:
 *
 * 1. **Serialization** — every read-merge-write cycle against a config file
 *    goes through `serialize(path, op)`, a per-resolved-path promise chain.
 *    Harness profiles where two steps target the same file (Gemini CLI's
 *    MCP config and hook both live in `~/.gemini/settings.json`) get their
 *    cycles strictly ordered, so no cycle can read a file another cycle is
 *    mid-way through rewriting — including if step orchestration ever
 *    becomes concurrent.
 *
 * 2. **Write attestation** — `recordWrite` keeps a sha-256 of the last bytes
 *    this process wrote to each path (called from `atomicWrite`, so every
 *    config write is attested with no call-site churn). NOTE:
 *    `fileMatchesLastWrite`/`hasRecordedWrite` have NO production consumer
 *    today — the package deliberately has no backup/rollback mechanism
 *    (see CHANGELOG: backups were removed as never-read). They exist as the
 *    guard any future rollback MUST use before writing over a file: only
 *    content this process provably wrote may be replaced. Until such a
 *    caller exists, attestation is bookkeeping, not an active safety
 *    property.
 *
 * Why not coalesce to one physical write per file per run: the hook entry
 * can only be written after the metrics tool files land on disk (a hook
 * pointing at a nonexistent hook.js fires a failing command in the user's
 * harness), so the MCP write and the hook write have a real data dependency.
 * Coalescing would couple MCP-config success to the metrics step's file
 * operations; serialized, attested, individually-atomic writes do not.
 */

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const chains = new Map<string, Promise<unknown>>();
const lastWritten = new Map<string, string>();

function sha256(content: string): string {
  return createHash("sha256").update(content, "utf-8").digest("hex");
}

/**
 * Run `op` exclusively with respect to every other serialized operation on
 * the same (resolved) path. Failures propagate to the caller but never
 * poison the chain for subsequent operations.
 */
export async function serialize<T>(
  path: string,
  op: () => Promise<T>,
): Promise<T> {
  const key = resolve(path);
  const prev = chains.get(key) ?? Promise.resolve();
  const run = prev.then(op, op);
  // Store a settled-safe tail so one failed op doesn't reject the chain.
  chains.set(
    key,
    run.then(
      () => undefined,
      () => undefined,
    ),
  );
  return run;
}

/** Attest that this process wrote exactly `content` to `path`. */
export function recordWrite(path: string, content: string): void {
  lastWritten.set(resolve(path), sha256(content));
}

/**
 * Restore guard: true when the file's current bytes are exactly the last
 * bytes this process wrote to it (or the file is missing — a failed write
 * can legitimately leave no file). False when we never wrote the path, or
 * when someone else has touched it since our write.
 */
export async function fileMatchesLastWrite(path: string): Promise<boolean> {
  const key = resolve(path);
  const expected = lastWritten.get(key);
  if (expected === undefined) return false;
  let current: string;
  try {
    current = await readFile(key, "utf-8");
  } catch (err) {
    // ONLY a missing file means "nothing of anyone else's to clobber". An
    // unreadable-but-present file (EACCES/EIO) is unverifiable — a guard
    // that answers true on an error it never inspected authorizes exactly
    // the clobber it exists to prevent.
    return (err as NodeJS.ErrnoException)?.code === "ENOENT";
  }
  return sha256(current) === expected;
}

/** Whether this process has attested a write to `path` at all. */
export function hasRecordedWrite(path: string): boolean {
  return lastWritten.has(resolve(path));
}

/** Test seam: clear all coordinator state. */
export function resetCoordinatorForTests(): void {
  chains.clear();
  lastWritten.clear();
}
