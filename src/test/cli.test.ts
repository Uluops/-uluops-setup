import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { installCli, uninstallCli, summarizeSpawnResult } from "../steps/cli.js";
import type { CliExecutor } from "../steps/cli.js";

function makeExecutor(overrides: Partial<CliExecutor> = {}): CliExecutor {
  return {
    detect: () => null,
    install: () => ({ ok: true }),
    uninstall: () => ({ ok: true }),
    ...overrides,
  };
}

describe("installCli", () => {
  it("returns alreadyPresent when ulu is already on PATH", async () => {
    let installCalled = false;
    const exec = makeExecutor({
      detect: () => "0.12.6",
      install: () => {
        installCalled = true;
        return { ok: true };
      },
    });
    const res = await installCli({ dryRun: false, executor: exec });
    expect(res).toEqual({
      installed: true,
      version: "0.12.6",
      alreadyPresent: true,
    });
    expect(installCalled).toBe(false);
  });

  it("installs and reports version on success", async () => {
    let detectCalls = 0;
    const exec = makeExecutor({
      detect: () => {
        detectCalls += 1;
        return detectCalls === 1 ? null : "0.12.6";
      },
      install: () => ({ ok: true }),
    });
    const res = await installCli({ dryRun: false, executor: exec });
    expect(res.installed).toBe(true);
    expect(res.version).toBe("0.12.6");
    expect(res.alreadyPresent).toBe(false);
    expect(res.error).toBeUndefined();
  });

  it("surfaces error and does not abort when npm install fails", async () => {
    const exec = makeExecutor({
      detect: () => null,
      install: () => ({ ok: false, error: "EACCES: permission denied" }),
    });
    const res = await installCli({ dryRun: false, executor: exec });
    expect(res.installed).toBe(false);
    expect(res.alreadyPresent).toBe(false);
    expect(res.error).toContain("EACCES");
  });

  it("reports installed=false when install succeeds but binary still not on PATH", async () => {
    const exec = makeExecutor({
      detect: () => null,
      install: () => ({ ok: true }),
    });
    const res = await installCli({ dryRun: false, executor: exec });
    expect(res.installed).toBe(false);
    expect(res.version).toBe(null);
  });

  it("skips executor entirely in dryRun when ulu absent", async () => {
    let installCalled = false;
    const exec = makeExecutor({
      detect: () => null,
      install: () => {
        installCalled = true;
        return { ok: true };
      },
    });
    const res = await installCli({ dryRun: true, executor: exec });
    expect(res.installed).toBe(false);
    expect(res.alreadyPresent).toBe(false);
    expect(installCalled).toBe(false);
  });

  it("still detects already-present in dryRun", async () => {
    const exec = makeExecutor({ detect: () => "0.12.6" });
    const res = await installCli({ dryRun: true, executor: exec });
    expect(res.alreadyPresent).toBe(true);
  });
});

describe("uninstallCli", () => {
  it("reports removed when ulu was not present to begin with", async () => {
    let uninstallCalled = false;
    const exec = makeExecutor({
      detect: () => null,
      uninstall: () => {
        uninstallCalled = true;
        return { ok: true };
      },
    });
    const res = await uninstallCli({ dryRun: false, executor: exec });
    expect(res.removed).toBe(true);
    expect(uninstallCalled).toBe(false);
  });

  it("calls npm uninstall when ulu is present", async () => {
    let uninstallCalled = false;
    const exec = makeExecutor({
      detect: () => "0.12.6",
      uninstall: () => {
        uninstallCalled = true;
        return { ok: true };
      },
    });
    const res = await uninstallCli({ dryRun: false, executor: exec });
    expect(uninstallCalled).toBe(true);
    expect(res.removed).toBe(true);
  });

  it("treats post-uninstall absence as success even when npm reported failure", async () => {
    let detectCalls = 0;
    const exec = makeExecutor({
      detect: () => {
        detectCalls += 1;
        return detectCalls === 1 ? "0.12.6" : null;
      },
      uninstall: () => ({ ok: false, error: "some npm warning" }),
    });
    const res = await uninstallCli({ dryRun: false, executor: exec });
    expect(res.removed).toBe(true);
  });

  it("surfaces error when ulu remains after failed uninstall", async () => {
    const exec = makeExecutor({
      detect: () => "0.12.6",
      uninstall: () => ({ ok: false, error: "EACCES" }),
    });
    const res = await uninstallCli({ dryRun: false, executor: exec });
    expect(res.removed).toBe(false);
    expect(res.error).toContain("EACCES");
  });

  it("does not call executor in dryRun", async () => {
    let called = false;
    const exec = makeExecutor({
      detect: () => {
        called = true;
        return "0.12.6";
      },
    });
    const res = await uninstallCli({ dryRun: true, executor: exec });
    expect(res.removed).toBe(true);
    expect(called).toBe(false);
  });
});

describe("summarizeSpawnResult — npm timeout handling", () => {
  it("recognizes a SIGTERM + null status as a timeout and surfaces a clear error message", () => {
    // Run a real subprocess with a tight timeout to produce a genuine
    // SIGTERM/null-status result, instead of fabricating the shape.
    const r = spawnSync(
      process.execPath,
      ["-e", "setInterval(() => {}, 1000)"],
      { encoding: "utf-8", timeout: 50 },
    );
    expect(r.signal).toBe("SIGTERM");
    expect(r.status).toBeNull();

    const summary = summarizeSpawnResult(r, "install");
    expect(summary.ok).toBe(false);
    expect(summary.error).toContain("timeout");
    expect(summary.error).toContain("install");
  });

  it("reports the captured stderr on a normal non-zero exit", () => {
    const r = spawnSync(
      process.execPath,
      ["-e", "process.stderr.write('boom'); process.exit(2)"],
      { encoding: "utf-8" },
    );
    expect(r.status).toBe(2);
    const summary = summarizeSpawnResult(r, "install");
    expect(summary.ok).toBe(false);
    expect(summary.error).toBe("boom");
  });

  it("returns ok on clean exit", () => {
    const r = spawnSync(process.execPath, ["-e", "process.exit(0)"], {
      encoding: "utf-8",
    });
    const summary = summarizeSpawnResult(r, "install");
    expect(summary).toEqual({ ok: true });
  });
});
