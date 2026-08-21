import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Integration harness for runSetup — the step-injection rig the tracker's
 * deferred catch-branch issue asked for. Every helper step is mocked so the
 * orchestration itself (lock lifecycle, per-harness failure isolation,
 * once-per-run gating, manifest aggregation, exit ordering) is the thing
 * under test, with no filesystem or network side effects.
 */
vi.mock("./../commands/helpers.js");
vi.mock("./../lib/install-lock.js");
vi.mock("./../lib/manifest.js");
vi.mock("./../steps/username.js");
vi.mock("./../lib/display.js", () => ({
  ok: vi.fn(),
  warn: vi.fn(),
  fail: vi.fn(),
  info: vi.fn(),
  blank: vi.fn(),
  printSetupBanner: vi.fn(),
  printHarnessHeader: vi.fn(),
  printSetupSummary: vi.fn(),
  maskKey: vi.fn((k: string) => k),
  printAgentList: vi.fn(),
}));

import { runSetup } from "../commands/setup.js";
import * as helpers from "../commands/helpers.js";
import { acquireInstallLock } from "../lib/install-lock.js";
import { loadManifest, saveManifest } from "../lib/manifest.js";
import { maybeSetUsername } from "../steps/username.js";
import { printSetupSummary } from "../lib/display.js";
import type { Manifest } from "../lib/manifest.js";

const h = vi.mocked(helpers);
const mockAcquireLock = vi.mocked(acquireInstallLock);
const mockLoadManifest = vi.mocked(loadManifest);
const mockSaveManifest = vi.mocked(saveManifest);
const mockMaybeSetUsername = vi.mocked(maybeSetUsername);
const mockSummary = vi.mocked(printSetupSummary);

/** Event journal — the ordering assertions read from this. */
let events: string[];

const baseOpts = {
  signup: false,
  scope: "global" as const,
  localDefs: false,
  shell: false,
  skipValidation: true,
  dryRun: false,
  yes: true, // skips conflict prompts — conflict path has its own test below
  harnesses: ["claude-code"],
};

function stubHappyPath(): void {
  h.initContext.mockResolvedValue({
    env: { shellProfile: null } as never,
    apiKey: "ulr_test",
  });
  h.checkConflicts.mockResolvedValue(undefined);
  h.configureMcpStep.mockResolvedValue({
    configPath: "/fake/claude.json",
    scope: "global",
    packageWarnings: [],
  });
  h.installAgentsDefs.mockResolvedValue({
    copied: 1,
    skipped: 0,
    removed: 0,
    files: ["a.md"],
    failures: [],
  } as never);
  h.installCommandsDefs.mockResolvedValue({
    copied: 0,
    skipped: 0,
    removed: 0,
    files: [],
    failures: [],
  } as never);
  h.installSkillsDefs.mockResolvedValue({
    copied: 0,
    skipped: 0,
    removed: 0,
    files: [],
    failures: [],
  } as never);
  h.configureMetricsStep.mockResolvedValue({
    toolFilesCopied: 0,
    hookConfigured: false,
    hooksInstalledVersion: null,
  } as never);
  h.configureCliStep.mockResolvedValue(null);
  h.configureAgentMetricsCliStep.mockResolvedValue(null as never);
  h.runHealthCheck.mockResolvedValue(undefined);
  h.configureShell.mockResolvedValue(false);
  mockMaybeSetUsername.mockResolvedValue(undefined as never);
  mockLoadManifest.mockResolvedValue(null);
  mockSaveManifest.mockResolvedValue(undefined as never);
  mockAcquireLock.mockResolvedValue({
    release: vi.fn(async () => {
      events.push("lock:release");
    }),
  } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  events = [];
  stubHappyPath();
});

describe("runSetup exit/lock ordering", () => {
  it("on operational failure, releases the install lock BEFORE process.exit(1)", async () => {
    h.configureMcpStep.mockRejectedValue(new Error("EACCES: config"));
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(((code?: number) => {
        events.push(`exit:${code}`);
        return undefined as never;
      }) as never);

    await runSetup(baseOpts);

    // The regression this pins: process.exit used to fire inside the try,
    // skipping the finally that releases the lock.
    expect(events).toEqual(["lock:release", "exit:1"]);
    exitSpy.mockRestore();
  });

  it("on success, releases the lock and does NOT call process.exit", async () => {
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((() => undefined as never) as never);

    await runSetup(baseOpts);

    expect(events).toEqual(["lock:release"]);
    expect(exitSpy).not.toHaveBeenCalled();
    exitSpy.mockRestore();
  });

  it("releases the lock even when a post-MCP step throws (partial path)", async () => {
    h.installAgentsDefs.mockRejectedValue(new Error("mkdir EACCES"));
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(((code?: number) => {
        events.push(`exit:${code}`);
        return undefined as never;
      }) as never);

    await runSetup(baseOpts);

    expect(events).toEqual(["lock:release", "exit:1"]);
    exitSpy.mockRestore();
  });
});

describe("runSetup per-harness failure isolation", () => {
  it("one harness's MCP failure does not abort the sibling", async () => {
    h.configureMcpStep
      .mockRejectedValueOnce(new Error("EACCES on first harness"))
      .mockResolvedValueOnce({
        configPath: "/fake/second.json",
        scope: "global",
        packageWarnings: [],
      });
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((() => undefined as never) as never);

    await runSetup({ ...baseOpts, harnesses: ["claude-code", "opencode"] });

    // Summary receives BOTH results: first failed, second ok.
    const results = mockSummary.mock.calls[0]![0].results;
    expect(results).toHaveLength(2);
    expect(results[0]!.status).toBe("failed");
    expect(results[1]!.status).toBe("ok");
    // Manifest aggregates only the harness with MCP success.
    const saved = mockSaveManifest.mock.calls[0]![0] as Manifest;
    expect(Object.keys(saved.harnesses)).toEqual(["opencode"]);
    // Operational failure still exits 1 after both harnesses ran.
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });

  it("a post-MCP step failure records a partial entry naming the failed step", async () => {
    h.installCommandsDefs.mockRejectedValue(new Error("disk full"));
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((() => undefined as never) as never);

    await runSetup(baseOpts);

    const saved = mockSaveManifest.mock.calls[0]![0] as Manifest;
    const entry = saved.harnesses["claude-code"]!;
    // MCP succeeded → entry exists; commands threw with agents complete →
    // partial names the step that failed, and the agents list is honest.
    expect(entry.partial).toBe("commands");
    expect(entry.agents).toEqual(["a.md"]);
    exitSpy.mockRestore();
  });
});

describe("runSetup once-per-run aggregation", () => {
  it("prompts for the agent-metrics CLI only when at least one harness configured the hook", async () => {
    await runSetup(baseOpts); // hookConfigured: false everywhere
    expect(h.configureAgentMetricsCliStep).not.toHaveBeenCalled();

    vi.clearAllMocks();
    events = [];
    stubHappyPath();
    h.configureMetricsStep.mockResolvedValue({
      toolFilesCopied: 3,
      hookConfigured: true,
      hooksInstalledVersion: "0.8.0",
    } as never);
    await runSetup(baseOpts);
    expect(h.configureAgentMetricsCliStep).toHaveBeenCalledTimes(1);
  });

  it("runs the CLI-install step exactly once across a multi-harness run", async () => {
    await runSetup({ ...baseOpts, harnesses: ["claude-code", "opencode"] });
    expect(h.configureCliStep).toHaveBeenCalledTimes(1);
    expect(h.initContext).toHaveBeenCalledTimes(1);
  });

  it("does not save a manifest when no harness reached MCP success", async () => {
    h.configureMcpStep.mockRejectedValue(new Error("down"));
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((() => undefined as never) as never);
    await runSetup(baseOpts);
    expect(mockSaveManifest).not.toHaveBeenCalled();
    exitSpy.mockRestore();
  });
});

describe("runSetup partial-state preservation over a prior install", () => {
  // The defect that survived three audit rounds because the only partial
  // test ran on a FRESH install: a step that throws during a RE-run must
  // not replace the populated prior entry with empty lists — uninstall
  // trusts those lists, and [] orphans every previously-installed file.
  const priorManifest = {
    version: "0.10.0",
    installedAt: "2026-08-01T00:00:00.000Z",
    shellModified: false,
    harnesses: {
      "claude-code": {
        installedAt: "2026-08-01T00:00:00.000Z",
        setupVersion: "0.10.0",
        mcpScope: "global" as const,
        mcpConfigPath: "/fake/claude.json",
        defsScope: "global" as const,
        defsPath: "/fake/home",
        agents: ["prev-a.md", "prev-b.md"],
        commands: ["agents/prev.md"],
        skills: ["skill/prev.md"],
        hooksInstalled: true,
        hooksInstalledVersion: "0.8.0",
        partial: null,
      },
    },
  };

  it("keeps the prior agents/commands/skills/hook record when a step throws mid-re-run", async () => {
    mockLoadManifest.mockResolvedValue(structuredClone(priorManifest));
    h.installAgentsDefs.mockRejectedValue(new Error("EACCES on assets"));
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((() => undefined as never) as never);

    await runSetup(baseOpts);

    const saved = mockSaveManifest.mock.calls[0]![0] as Manifest;
    const entry = saved.harnesses["claude-code"]!;
    expect(entry.partial).toBe("agents");
    // Preservation is the assertion — [] here means orphaned files.
    expect(entry.agents).toEqual(["prev-a.md", "prev-b.md"]);
    expect(entry.commands).toEqual(["agents/prev.md"]);
    expect(entry.skills).toEqual(["skill/prev.md"]);
    expect(entry.hooksInstalled).toBe(true);
    expect(entry.hooksInstalledVersion).toBe("0.8.0");
    exitSpy.mockRestore();
  });

  it("a completed step's fresh result still wins over the prior record", async () => {
    mockLoadManifest.mockResolvedValue(structuredClone(priorManifest));
    // agents completes with a NEW list; commands throws after it.
    h.installCommandsDefs.mockRejectedValue(new Error("disk full"));
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((() => undefined as never) as never);

    await runSetup(baseOpts);

    const saved = mockSaveManifest.mock.calls[0]![0] as Manifest;
    const entry = saved.harnesses["claude-code"]!;
    expect(entry.partial).toBe("commands");
    expect(entry.agents).toEqual(["a.md"]); // fresh result from stubHappyPath
    expect(entry.commands).toEqual(["agents/prev.md"]); // preserved
    exitSpy.mockRestore();
  });
});
