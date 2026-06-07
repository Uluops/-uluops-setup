import { describe, it, expect, beforeEach, vi } from "vitest";
import { writeFile, mkdir, mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

// verify() uses loadManifest and getProfile (which returns real profiles).
// We mock loadManifest to control the manifest shape, but let profiles
// use their real McpConfigStrategy implementations.
vi.mock("../lib/manifest.js");

import { verify } from "../steps/verify.js";
import { loadManifest } from "../lib/manifest.js";
import type { Manifest } from "../lib/manifest.js";

const mockLoadManifest = vi.mocked(loadManifest);

let tmpDir: string;

function makeManifest(
  defsPath: string,
  mcpConfigPath: string,
  overrides?: Partial<Manifest["harnesses"]["claude-code"]>,
): Manifest {
  return {
    version: "0.3.0",
    installedAt: "2026-05-01T00:00:00Z",
    shellModified: false,
    harnesses: {
      "claude-code": {
        installedAt: "2026-05-01T00:00:00Z",
        setupVersion: "0.3.0",
        mcpScope: "global",
        mcpConfigPath,
        defsScope: "global",
        defsPath,
        agents: [],
        commands: [],
        hooksInstalled: false,
        ...overrides,
      },
    },
  };
}

beforeEach(async () => {
  vi.clearAllMocks();
  vi.stubEnv("ULUOPS_API_KEY", "");
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
    await mkdir(agentsDir, { recursive: true });

    // Write a real Claude Code config with both servers
    const configPath = join(tmpDir, "claude.json");
    await writeFile(
      configPath,
      JSON.stringify({
        mcpServers: {
          "uluops-tracker": { command: "npx", args: [], env: {} },
          "uluops-registry": { command: "npx", args: [], env: {} },
        },
      }),
    );
    await writeFile(join(agentsDir, "agent1.md"), "content");

    mockLoadManifest.mockResolvedValue(
      makeManifest(defsPath, configPath, { agents: ["agent1.md"] }),
    );

    const result = await verify();

    const mcpCheck = result.checks.find((c) =>
      c.label.includes("MCP config"),
    );
    expect(mcpCheck).toBeDefined();
    expect(mcpCheck!.passed).toBe(true);
  });

  it("reports missing MCP servers", async () => {
    const defsPath = join(tmpDir, "defs");
    await mkdir(join(defsPath, "agents"), { recursive: true });

    const configPath = join(tmpDir, "claude.json");
    await writeFile(
      configPath,
      JSON.stringify({
        mcpServers: {
          "uluops-registry": { command: "npx", args: [], env: {} },
        },
      }),
    );

    mockLoadManifest.mockResolvedValue(makeManifest(defsPath, configPath));

    const result = await verify();

    expect(result.ok).toBe(false);
    const mcpCheck = result.checks.find(
      (c) => c.label.includes("MCP config") && !c.passed,
    );
    expect(mcpCheck).toBeDefined();
  });

  it("reports missing agent files", async () => {
    const defsPath = join(tmpDir, "defs");
    await mkdir(join(defsPath, "agents"), { recursive: true });
    await writeFile(join(defsPath, "agents", "agent1.md"), "content");

    const configPath = join(tmpDir, "claude.json");
    await writeFile(configPath, JSON.stringify({ mcpServers: { "uluops-tracker": {}, "uluops-registry": {} } }));

    mockLoadManifest.mockResolvedValue(
      makeManifest(defsPath, configPath, {
        agents: ["agent1.md", "agent2.md"],
      }),
    );

    const result = await verify();

    expect(result.ok).toBe(false);
    const agentCheck = result.checks.find((c) => c.label.includes("agents"));
    expect(agentCheck).toBeDefined();
    expect(agentCheck!.passed).toBe(false);
    expect(agentCheck!.detail).toContain("Missing 1");
  });

  it("emits partial-install warning when manifest entry has partial set", async () => {
    // Partial install means a per-harness step threw mid-pipeline after
    // MCP succeeded. The recorded file lists are still honest (post-Phase
    // 0.5 contract), so the per-file checks should still pass, but the
    // run must flip to ok=false so the user knows to re-run.
    const defsPath = join(tmpDir, "defs");
    await mkdir(join(defsPath, "agents"), { recursive: true });
    await writeFile(join(defsPath, "agents", "a.md"), "content");

    const configPath = join(tmpDir, "claude.json");
    await writeFile(
      configPath,
      JSON.stringify({
        mcpServers: {
          "uluops-tracker": { command: "npx", args: [], env: {} },
          "uluops-registry": { command: "npx", args: [], env: {} },
        },
      }),
    );

    mockLoadManifest.mockResolvedValue(
      makeManifest(defsPath, configPath, {
        agents: ["a.md"],
        partial: "commands", // step that threw — commands never attempted
      }),
    );

    const result = await verify();

    expect(result.ok).toBe(false);
    const partialCheck = result.checks.find((c) =>
      c.label.includes("partial install"),
    );
    expect(partialCheck).toBeDefined();
    expect(partialCheck!.passed).toBe(false);
    expect(partialCheck!.label).toContain('failed at "commands"');
    expect(partialCheck!.detail).toContain("Re-run: npx @uluops/setup --harness claude-code");

    // The per-file MCP + agents checks should still have run and passed
    // (recorded lists are honest — partial is about which step DIDN'T run,
    // not corruption of what did).
    const mcpCheck = result.checks.find((c) => c.label.includes("MCP config"));
    expect(mcpCheck?.passed).toBe(true);
    const agentsCheck = result.checks.find((c) => c.label.includes("agents in"));
    expect(agentsCheck?.passed).toBe(true);
  });

  it("partial: null on the manifest entry does NOT emit the partial-install check", async () => {
    // Regression guard: pre-Phase-1 manifests have no `partial` field at
    // all; Phase 1+ writes `partial: null` for fully-installed harnesses.
    // Neither case should produce a partial-install warning row.
    const defsPath = join(tmpDir, "defs");
    await mkdir(join(defsPath, "agents"), { recursive: true });
    await writeFile(join(defsPath, "agents", "a.md"), "content");

    const configPath = join(tmpDir, "claude.json");
    await writeFile(
      configPath,
      JSON.stringify({
        mcpServers: {
          "uluops-tracker": { command: "npx", args: [], env: {} },
          "uluops-registry": { command: "npx", args: [], env: {} },
        },
      }),
    );

    mockLoadManifest.mockResolvedValue(
      makeManifest(defsPath, configPath, {
        agents: ["a.md"],
        partial: null,
      }),
    );

    const result = await verify();
    const partialCheck = result.checks.find((c) =>
      c.label.includes("partial install"),
    );
    expect(partialCheck).toBeUndefined();
  });

  it("passes when all manifest entries match filesystem", async () => {
    const defsPath = join(tmpDir, "defs");
    await mkdir(join(defsPath, "agents"), { recursive: true });
    await writeFile(join(defsPath, "agents", "a.md"), "content");

    const configPath = join(tmpDir, "claude.json");
    await writeFile(
      configPath,
      JSON.stringify({
        mcpServers: {
          "uluops-tracker": { command: "npx", args: [], env: { ULUOPS_API_KEY: "ulr_test" } },
          "uluops-registry": { command: "npx", args: [], env: { ULUOPS_API_KEY: "ulr_test" } },
        },
      }),
    );

    mockLoadManifest.mockResolvedValue(
      makeManifest(defsPath, configPath, { agents: ["a.md"] }),
    );

    const result = await verify();

    const failedChecks = result.checks.filter((c) => !c.passed);
    expect(failedChecks).toHaveLength(0);
    expect(result.ok).toBe(true);
  });
});
