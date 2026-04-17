import { describe, it, expect, beforeEach, vi } from "vitest";
import { writeFile, mkdir, mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

// verify() depends on loadManifest (reads ~/.claude/uluops-manifest.json),
// readConfig, readSettings, fetch, and filesystem checks.
// We mock the modules to control the environment.

vi.mock("../lib/manifest.js");
vi.mock("../lib/config-merger.js");
vi.mock("../lib/settings-merger.js");
vi.mock("./metrics.js", () => ({
  getMetricsToolDir: () => "/tmp/fake-metrics-tool-dir",
  getSettingsPath: () => "/tmp/fake-settings.json",
}));

import { verify } from "../steps/verify.js";
import { loadManifest } from "../lib/manifest.js";
import { readConfig } from "../lib/config-merger.js";
import { readSettings, hasUluopsHook } from "../lib/settings-merger.js";

const mockLoadManifest = vi.mocked(loadManifest);
const mockReadConfig = vi.mocked(readConfig);
const mockReadSettings = vi.mocked(readSettings);
const mockHasUluopsHook = vi.mocked(hasUluopsHook);

let tmpDir: string;

beforeEach(async () => {
  vi.clearAllMocks();
  tmpDir = await mkdtemp(join(tmpdir(), "uluops-verify-"));
});

describe("verify", () => {
  it("returns failed check when no manifest exists", async () => {
    mockLoadManifest.mockResolvedValue(null);

    const result = await verify();

    expect(result.ok).toBe(false);
    expect(result.checks).toHaveLength(1);
    expect(result.checks[0]!.label).toBe("Manifest found");
    expect(result.checks[0]!.passed).toBe(false);
  });

  it("checks MCP config for both servers", async () => {
    const defsPath = join(tmpDir, "defs");
    const agentsDir = join(defsPath, "agents");
    const commandsDir = join(defsPath, "commands");
    await mkdir(agentsDir, { recursive: true });
    await mkdir(join(commandsDir, "agents"), { recursive: true });
    await writeFile(join(agentsDir, "agent1.md"), "content");
    await writeFile(join(commandsDir, "agents", "cmd1.md"), "content");

    mockLoadManifest.mockResolvedValue({
      version: "0.2.0",
      installedAt: "2026-04-16T00:00:00Z",
      mcpConfigPath: "/tmp/claude.json",
      defsPath,
      agents: ["agent1.md"],
      commands: ["agents/cmd1.md"],
      metricsHookInstalled: false,
    });
    mockReadConfig.mockResolvedValue({
      mcpServers: {
        "uluops-tracker": { command: "npx", args: [], env: {} },
        "uluops-registry": { command: "npx", args: [], env: {} },
      },
    });

    const result = await verify();

    const mcpCheck = result.checks.find((c) => c.label.includes("MCP config"));
    expect(mcpCheck).toBeDefined();
    expect(mcpCheck!.passed).toBe(true);
  });

  it("reports missing tracker server", async () => {
    const defsPath = join(tmpDir, "defs");
    await mkdir(join(defsPath, "agents"), { recursive: true });
    await mkdir(join(defsPath, "commands"), { recursive: true });

    mockLoadManifest.mockResolvedValue({
      version: "0.2.0",
      installedAt: "2026-04-16T00:00:00Z",
      mcpConfigPath: "/tmp/claude.json",
      defsPath,
      agents: [],
      commands: [],
      metricsHookInstalled: false,
    });
    mockReadConfig.mockResolvedValue({
      mcpServers: {
        "uluops-registry": { command: "npx", args: [], env: {} },
      },
    });

    const result = await verify();

    expect(result.ok).toBe(false);
    const mcpCheck = result.checks.find((c) => c.label === "MCP config");
    expect(mcpCheck).toBeDefined();
    expect(mcpCheck!.passed).toBe(false);
    expect(mcpCheck!.detail).toContain("tracker");
  });

  it("reports missing agent files", async () => {
    const defsPath = join(tmpDir, "defs");
    await mkdir(join(defsPath, "agents"), { recursive: true });
    await mkdir(join(defsPath, "commands"), { recursive: true });
    // Only write 1 of 2 expected agents
    await writeFile(join(defsPath, "agents", "agent1.md"), "content");

    mockLoadManifest.mockResolvedValue({
      version: "0.2.0",
      installedAt: "2026-04-16T00:00:00Z",
      mcpConfigPath: "/tmp/claude.json",
      defsPath,
      agents: ["agent1.md", "agent2.md"],
      commands: [],
      metricsHookInstalled: false,
    });
    mockReadConfig.mockResolvedValue({
      mcpServers: {
        "uluops-tracker": { command: "npx", args: [], env: {} },
        "uluops-registry": { command: "npx", args: [], env: {} },
      },
    });

    const result = await verify();

    expect(result.ok).toBe(false);
    const agentCheck = result.checks.find((c) => c.label.includes("agents"));
    expect(agentCheck).toBeDefined();
    expect(agentCheck!.passed).toBe(false);
    expect(agentCheck!.detail).toContain("Missing 1");
  });

  it("passes when all manifest entries match filesystem", async () => {
    const defsPath = join(tmpDir, "defs");
    const agentsDir = join(defsPath, "agents");
    const commandsDir = join(defsPath, "commands", "agents");
    await mkdir(agentsDir, { recursive: true });
    await mkdir(commandsDir, { recursive: true });
    await writeFile(join(agentsDir, "a.md"), "content");
    await writeFile(join(commandsDir, "c.md"), "content");

    mockLoadManifest.mockResolvedValue({
      version: "0.2.0",
      installedAt: "2026-04-16T00:00:00Z",
      mcpConfigPath: "/tmp/claude.json",
      defsPath,
      agents: ["a.md"],
      commands: ["agents/c.md"],
      metricsHookInstalled: false,
    });
    mockReadConfig.mockResolvedValue({
      mcpServers: {
        "uluops-tracker": { command: "npx", args: [], env: { ULUOPS_TRACKER_API_KEY: "ulr_test" } },
        "uluops-registry": { command: "npx", args: [], env: { ULUOPS_API_KEY: "ulr_test" } },
      },
    });

    // Mock fetch for API connectivity check
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ email: "test@example.com" }),
    }));

    const result = await verify();

    // All non-API checks should pass
    const failedChecks = result.checks.filter((c) => !c.passed);
    expect(failedChecks).toHaveLength(0);
    expect(result.ok).toBe(true);

    vi.unstubAllGlobals();
  });
});
