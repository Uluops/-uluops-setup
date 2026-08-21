import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
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

const originalFetch = globalThis.fetch;

beforeEach(async () => {
  vi.clearAllMocks();
  vi.stubEnv("ULUOPS_API_KEY", "");
  tmpDir = await mkdtemp(join(tmpdir(), "uluops-verify-"));
  // verify() now probes npm resolvability (and may hit auth/health
  // endpoints): stub fetch so NO test in this file depends on live network,
  // and reset the availability cache so per-test stubs actually apply.
  // Pattern mirrors config-merger.test.ts.
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ data: { email: "verify@test" } }),
  } as unknown as Response);
  const { __resetAvailabilityCacheForTesting } = await import(
    "../lib/config-merger.js"
  );
  __resetAvailabilityCacheForTesting();
});

afterEach(async () => {
  globalThis.fetch = originalFetch;
  const { __resetAvailabilityCacheForTesting } = await import(
    "../lib/config-merger.js"
  );
  __resetAvailabilityCacheForTesting();
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

describe("MCP package resolvability check", () => {
  // Helper: a fully-healthy on-disk state so the ONLY variable is the
  // npm probe. Mirrors the "passes when all manifest entries match" setup.
  async function healthySetup(): Promise<void> {
    const defsPath = join(tmpDir, "defs");
    await mkdir(join(defsPath, "agents"), { recursive: true });
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
    mockLoadManifest.mockResolvedValue(makeManifest(defsPath, configPath));
  }

  it("passes and appears in checks when every package resolves", async () => {
    await healthySetup();
    const result = await verify();
    const check = result.checks.find(
      (c) => c.label === "MCP packages resolvable on npm",
    );
    expect(check).toBeDefined();
    expect(check!.passed).toBe(true);
  });

  it("fails the run and names the packages when the registry 404s them", async () => {
    await healthySetup();
    globalThis.fetch = vi.fn().mockImplementation((url: string | URL) => {
      const u = String(url);
      if (u.includes("registry.npmjs.org")) {
        return Promise.resolve({ ok: false, status: 404 } as Response);
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ data: { email: "verify@test" } }),
      } as unknown as Response);
    });
    const result = await verify();
    const check = result.checks.find(
      (c) => c.label === "MCP packages resolvable on npm",
    );
    expect(check).toBeDefined();
    expect(check!.passed).toBe(false);
    expect(check!.detail).toContain("not found in registry");
    expect(check!.detail).toContain("MCP servers will fail to start");
    expect(result.ok).toBe(false);
  });

  it("reports registry-unreachable without double-failing the run", async () => {
    await healthySetup();
    globalThis.fetch = vi.fn().mockImplementation((url: string | URL) => {
      const u = String(url);
      if (u.includes("registry.npmjs.org")) {
        return Promise.reject(
          Object.assign(new Error("getaddrinfo ENOTFOUND"), {
            code: "ENOTFOUND",
          }),
        );
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ data: { email: "verify@test" } }),
      } as unknown as Response);
    });
    const result = await verify();
    const check = result.checks.find(
      (c) => c.label === "MCP packages resolvable on npm",
    );
    expect(check).toBeDefined();
    // Network failures on individual fetches land in `missing` via
    // allSettled (the probe itself resolves) — either way the check must
    // not pass silently AND must carry a detail naming the condition.
    expect(check!.passed).toBe(false);
    expect(check!.detail).toBeTruthy();
  });
});
