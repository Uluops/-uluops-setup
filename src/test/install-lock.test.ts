import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, mkdtemp, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir, hostname } from "node:os";
import { join } from "node:path";
import {
  acquireInstallLock,
  InstallLockHeldError,
  __resetSignalHandlersForTesting,
} from "../lib/install-lock.js";

let tmpDir: string;
let lockDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "uluops-lock-"));
  lockDir = join(tmpDir, "install.lock");
  __resetSignalHandlersForTesting();
});

afterEach(async () => {
  try {
    await rm(tmpDir, { recursive: true, force: true });
  } catch {
    // Best-effort.
  }
});

describe("acquireInstallLock", () => {
  it("acquires a fresh lock and releases it cleanly", async () => {
    const handle = await acquireInstallLock({ lockDir });
    await expect(stat(lockDir)).resolves.toMatchObject({ isDirectory: expect.any(Function) });
    await handle.release();
    await expect(stat(lockDir)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("acquires a lock whose parent directory does not yet exist", async () => {
    // Regression: first-time users with no ~/.uluops/ on disk hit
    // ENOENT inside the `recursive: false` mkdir on the lock dir.
    // The fix pre-creates the parent with `recursive: true` while keeping
    // the lock-dir mkdir atomic. Discovered by docker/scenarios/fresh-install.sh.
    const nestedLockDir = join(tmpDir, "missing-parent", "install.lock");
    await expect(stat(join(tmpDir, "missing-parent"))).rejects.toMatchObject({ code: "ENOENT" });

    const handle = await acquireInstallLock({ lockDir: nestedLockDir });
    await expect(stat(nestedLockDir)).resolves.toMatchObject({ isDirectory: expect.any(Function) });
    await handle.release();
  });

  it("rejects a second acquisition while the first is held (fails fast with waitMs=0)", async () => {
    const handle = await acquireInstallLock({ lockDir });
    try {
      await expect(acquireInstallLock({ lockDir })).rejects.toBeInstanceOf(
        InstallLockHeldError,
      );
    } finally {
      await handle.release();
    }
  });

  it("InstallLockHeldError carries the holding PID, hostname, and age", async () => {
    const handle = await acquireInstallLock({ lockDir });
    try {
      await acquireInstallLock({ lockDir });
      throw new Error("expected acquire to reject");
    } catch (err) {
      expect(err).toBeInstanceOf(InstallLockHeldError);
      const e = err as InstallLockHeldError;
      expect(e.holder.pid).toBe(process.pid);
      expect(e.holder.hostname).toBe(hostname());
      expect(e.holder.ageMs).toBeGreaterThanOrEqual(0);
      expect(e.message).toContain(String(process.pid));
    } finally {
      await handle.release();
    }
  });

  it("reclaims a lock whose PID is no longer alive", async () => {
    // Hand-build a lock dir pointing at a definitely-dead PID on this host.
    await mkdir(lockDir);
    const meta = {
      pid: 999999, // very unlikely to be live
      hostname: hostname(),
      startedAt: Date.now() - 1000,
    };
    await writeFile(join(lockDir, "meta.json"), JSON.stringify(meta));

    const handle = await acquireInstallLock({ lockDir });
    // Reclaim succeeded — our handle is held now.
    const contents = await readdir(lockDir);
    expect(contents).toContain("meta.json");
    await handle.release();
  });

  it("reclaims a lock older than maxAgeMs (timeout path)", async () => {
    await mkdir(lockDir);
    const meta = {
      pid: process.pid, // intentionally a live PID — only timeout should matter
      hostname: hostname(),
      startedAt: Date.now() - 60_000,
    };
    await writeFile(join(lockDir, "meta.json"), JSON.stringify(meta));

    const handle = await acquireInstallLock({ lockDir, maxAgeMs: 1000 });
    await handle.release();
  });

  it("reclaims a lock with corrupt metadata", async () => {
    await mkdir(lockDir);
    await writeFile(join(lockDir, "meta.json"), "not json{{{");

    const handle = await acquireInstallLock({ lockDir });
    await handle.release();
  });

  it("reclaims a lock dir with no meta file at all", async () => {
    await mkdir(lockDir);
    // No meta.json.
    const handle = await acquireInstallLock({ lockDir });
    await handle.release();
  });

  it("waitMs polls until the lock is released", async () => {
    const first = await acquireInstallLock({ lockDir });
    const releaseAt = Date.now() + 600;
    setTimeout(() => {
      void first.release();
    }, 600);

    const start = Date.now();
    const second = await acquireInstallLock({ lockDir, waitMs: 3000 });
    const elapsed = Date.now() - start;

    // Should have waited approximately until the release fired.
    expect(elapsed).toBeGreaterThanOrEqual(500);
    expect(Date.now()).toBeGreaterThanOrEqual(releaseAt);
    await second.release();
  });

  it("waitMs fails after the deadline if the holder never releases", async () => {
    const first = await acquireInstallLock({ lockDir });
    try {
      await expect(
        acquireInstallLock({ lockDir, waitMs: 800 }),
      ).rejects.toBeInstanceOf(InstallLockHeldError);
    } finally {
      await first.release();
    }
  });

  it("release is idempotent", async () => {
    const handle = await acquireInstallLock({ lockDir });
    await handle.release();
    await expect(handle.release()).resolves.toBeUndefined();
  });

  it("treats cross-host lock as live until timeout, then reclaims", async () => {
    await mkdir(lockDir);
    const meta = {
      pid: 1, // can't be probed across hosts; we trust the meta
      hostname: "some-other-machine.local",
      startedAt: Date.now() - 500,
    };
    await writeFile(join(lockDir, "meta.json"), JSON.stringify(meta));

    // Within maxAge: locked.
    await expect(
      acquireInstallLock({ lockDir, maxAgeMs: 60_000 }),
    ).rejects.toBeInstanceOf(InstallLockHeldError);

    // Past maxAge: reclaimable.
    const handle = await acquireInstallLock({ lockDir, maxAgeMs: 100 });
    await handle.release();
  });
});
