import { describe, it, expect } from "vitest";
import {
  installAgentMetricsCli,
  uninstallAgentMetricsCli,
  parseGlobalAgentMetricsVersion,
} from "../steps/agent-metrics-cli.js";
import type { AgentMetricsCliExecutor } from "../steps/agent-metrics-cli.js";

describe("parseGlobalAgentMetricsVersion", () => {
  // Regression: prior detect() used `spawnSync("agent-metrics", ["--version"])`,
  // which produced a false positive under npx because @uluops/agent-metrics is
  // a runtime dep of @uluops/setup → npx's transient .bin/ is on PATH during
  // the spawn but not after. We now parse `npm ls -g --json` directly.

  it("returns the version when the package is in npm's global tree", () => {
    const stdout = JSON.stringify({
      name: "lib",
      dependencies: {
        "@uluops/agent-metrics": { version: "0.4.0", overridden: false },
      },
    });
    expect(parseGlobalAgentMetricsVersion(stdout)).toBe("0.4.0");
  });

  it("returns null when the package is not in the global tree", () => {
    // npm ls -g exits non-zero in this case but still emits {} or { dependencies: {} }
    expect(parseGlobalAgentMetricsVersion(JSON.stringify({ name: "lib" }))).toBeNull();
    expect(
      parseGlobalAgentMetricsVersion(JSON.stringify({ dependencies: {} })),
    ).toBeNull();
  });

  it("returns null for unrelated packages in dependencies", () => {
    const stdout = JSON.stringify({
      dependencies: { "other-package": { version: "1.0.0" } },
    });
    expect(parseGlobalAgentMetricsVersion(stdout)).toBeNull();
  });

  it("returns null when version field is missing from the entry", () => {
    const stdout = JSON.stringify({
      dependencies: { "@uluops/agent-metrics": { overridden: false } },
    });
    expect(parseGlobalAgentMetricsVersion(stdout)).toBeNull();
  });

  it("returns null for unparseable stdout (npm error case)", () => {
    expect(parseGlobalAgentMetricsVersion("not json")).toBeNull();
    expect(parseGlobalAgentMetricsVersion("")).toBeNull();
    expect(parseGlobalAgentMetricsVersion(undefined)).toBeNull();
  });
});

function makeExecutor(
  overrides: Partial<AgentMetricsCliExecutor> = {},
): AgentMetricsCliExecutor {
  return {
    detect: () => null,
    install: () => ({ ok: true }),
    uninstall: () => ({ ok: true }),
    ...overrides,
  };
}

describe("installAgentMetricsCli", () => {
  it("returns alreadyPresent when agent-metrics is already on PATH", async () => {
    let installCalled = false;
    const exec = makeExecutor({
      detect: () => "0.4.0",
      install: () => {
        installCalled = true;
        return { ok: true };
      },
    });
    const res = await installAgentMetricsCli({ dryRun: false, executor: exec });
    expect(res).toEqual({
      installed: true,
      version: "0.4.0",
      alreadyPresent: true,
    });
    expect(installCalled).toBe(false);
  });

  it("installs and reports version on success", async () => {
    let detectCalls = 0;
    const exec = makeExecutor({
      detect: () => {
        detectCalls += 1;
        return detectCalls === 1 ? null : "0.4.0";
      },
      install: () => ({ ok: true }),
    });
    const res = await installAgentMetricsCli({ dryRun: false, executor: exec });
    expect(res.installed).toBe(true);
    expect(res.version).toBe("0.4.0");
    expect(res.alreadyPresent).toBe(false);
    expect(res.error).toBeUndefined();
  });

  it("surfaces error and does not abort when npm install fails", async () => {
    const exec = makeExecutor({
      detect: () => null,
      install: () => ({ ok: false, error: "EACCES: permission denied" }),
    });
    const res = await installAgentMetricsCli({ dryRun: false, executor: exec });
    expect(res.installed).toBe(false);
    expect(res.alreadyPresent).toBe(false);
    expect(res.error).toContain("EACCES");
  });

  it("reports installed=false when install succeeds but binary still not on PATH", async () => {
    const exec = makeExecutor({
      detect: () => null,
      install: () => ({ ok: true }),
    });
    const res = await installAgentMetricsCli({ dryRun: false, executor: exec });
    expect(res.installed).toBe(false);
    expect(res.version).toBe(null);
  });

  it("skips executor entirely in dryRun when agent-metrics absent", async () => {
    let installCalled = false;
    const exec = makeExecutor({
      detect: () => null,
      install: () => {
        installCalled = true;
        return { ok: true };
      },
    });
    const res = await installAgentMetricsCli({ dryRun: true, executor: exec });
    expect(res.installed).toBe(false);
    expect(res.alreadyPresent).toBe(false);
    expect(installCalled).toBe(false);
  });

  it("still detects already-present in dryRun", async () => {
    const exec = makeExecutor({ detect: () => "0.4.0" });
    const res = await installAgentMetricsCli({ dryRun: true, executor: exec });
    expect(res.alreadyPresent).toBe(true);
  });
});

describe("uninstallAgentMetricsCli", () => {
  it("reports removed when agent-metrics was not present to begin with", async () => {
    let uninstallCalled = false;
    const exec = makeExecutor({
      detect: () => null,
      uninstall: () => {
        uninstallCalled = true;
        return { ok: true };
      },
    });
    const res = await uninstallAgentMetricsCli({ dryRun: false, executor: exec });
    expect(res.removed).toBe(true);
    expect(uninstallCalled).toBe(false);
  });

  it("calls npm uninstall when agent-metrics is present", async () => {
    let uninstallCalled = false;
    const exec = makeExecutor({
      detect: () => "0.4.0",
      uninstall: () => {
        uninstallCalled = true;
        return { ok: true };
      },
    });
    const res = await uninstallAgentMetricsCli({ dryRun: false, executor: exec });
    expect(uninstallCalled).toBe(true);
    expect(res.removed).toBe(true);
  });

  it("treats post-uninstall absence as success even when npm reported failure", async () => {
    let detectCalls = 0;
    const exec = makeExecutor({
      detect: () => {
        detectCalls += 1;
        return detectCalls === 1 ? "0.4.0" : null;
      },
      uninstall: () => ({ ok: false, error: "some npm warning" }),
    });
    const res = await uninstallAgentMetricsCli({ dryRun: false, executor: exec });
    expect(res.removed).toBe(true);
  });

  it("surfaces error when agent-metrics remains after failed uninstall", async () => {
    const exec = makeExecutor({
      detect: () => "0.4.0",
      uninstall: () => ({ ok: false, error: "EACCES" }),
    });
    const res = await uninstallAgentMetricsCli({ dryRun: false, executor: exec });
    expect(res.removed).toBe(false);
    expect(res.error).toContain("EACCES");
  });

  it("does not call executor in dryRun", async () => {
    let called = false;
    const exec = makeExecutor({
      detect: () => {
        called = true;
        return "0.4.0";
      },
    });
    const res = await uninstallAgentMetricsCli({ dryRun: true, executor: exec });
    expect(res.removed).toBe(true);
    expect(called).toBe(false);
  });
});
