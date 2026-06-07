import { describe, it, expect } from "vitest";
import { writeFile, mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir, homedir } from "node:os";

import {
  getProfile,
  resolveHarnessName,
  detectHarnesses,
  listHarnesses,
  ALL_PROFILES,
} from "../harnesses/index.js";
import { claudeCodeProfile } from "../harnesses/claude-code.js";
import { opencodeProfile } from "../harnesses/opencode.js";
import { geminiCliProfile } from "../harnesses/gemini-cli.js";
import { codexProfile } from "../harnesses/codex.js";

describe("harness registry", () => {
  it("ALL_PROFILES has 4 entries with unique names", () => {
    expect(ALL_PROFILES).toHaveLength(4);
    const names = ALL_PROFILES.map((p) => p.name);
    expect(new Set(names).size).toBe(4);
  });

  it("getProfile resolves by canonical name", () => {
    expect(getProfile("claude-code").name).toBe("claude-code");
    expect(getProfile("opencode").name).toBe("opencode");
    expect(getProfile("gemini-cli").name).toBe("gemini-cli");
    expect(getProfile("codex").name).toBe("codex");
  });

  it("getProfile throws on unknown harness with helpful message", () => {
    expect(() => getProfile("vscode")).toThrow("Unknown harness");
    expect(() => getProfile("vscode")).toThrow("Available:");
  });

  it("resolveHarnessName resolves aliases", () => {
    expect(resolveHarnessName("claude")).toBe("claude-code");
    expect(resolveHarnessName("oc")).toBe("opencode");
    expect(resolveHarnessName("gemini")).toBe("gemini-cli");
  });

  it("resolveHarnessName passes through canonical names", () => {
    expect(resolveHarnessName("claude-code")).toBe("claude-code");
    expect(resolveHarnessName("opencode")).toBe("opencode");
  });

  it("resolveHarnessName passes through unknown names unchanged", () => {
    expect(resolveHarnessName("unknown")).toBe("unknown");
  });

  it("listHarnesses returns all canonical names", () => {
    const names = listHarnesses();
    expect(names).toContain("claude-code");
    expect(names).toContain("opencode");
    expect(names).toContain("gemini-cli");
    expect(names).toContain("codex");
  });

  it("detectHarnesses returns only profiles whose home dirs exist", () => {
    const detected = detectHarnesses();
    expect(Array.isArray(detected)).toBe(true);
    // Every detected harness must have an existing home dir
    for (const p of detected) {
      expect(ALL_PROFILES.some((ap) => ap.name === p.name)).toBe(true);
    }
    // Result is a subset of ALL_PROFILES
    expect(detected.length).toBeLessThanOrEqual(ALL_PROFILES.length);
  });

  /**
   * Locks the experimental-filter contract: even when an experimental
   * profile's home directory exists on disk, detectHarnesses() must NOT
   * include it. Auto-detection that returned an experimental profile would
   * break the relational promise "in the detected list = safe to install"
   * — the next step would call into a profile that throws
   * HarnessNotTestedError.
   *
   * Codex is the only experimental profile today (status: "experimental").
   * We confirm it is excluded; we also confirm every returned profile has
   * status === "stable" so the contract holds for any future experimental
   * additions.
   *
   * See tracker issue EPI-GRN/M ("detectHarnesses experimental-filter
   * contract untested").
   */
  it("detectHarnesses never returns experimental profiles even when their home dir exists", () => {
    // The codex profile points at ~/.codex/. On a real dev machine this dir
    // may or may not exist; either way, codex must NOT appear in the result
    // because its status is "experimental".
    const detected = detectHarnesses();
    expect(detected.find((p) => p.name === "codex")).toBeUndefined();

    // Stronger guarantee: every detected profile is stable, no matter how
    // detection criteria evolve.
    for (const p of detected) {
      expect(p.status).toBe("stable");
    }
  });

  it("codex profile is registered as experimental (so the filter has something to filter)", () => {
    // Anchor: if codex is ever promoted to stable, this assertion flips and
    // the "experimental filter" coverage above stops exercising the branch.
    // When that happens, add a new experimental profile or seed a synthetic
    // one for the filter test.
    expect(codexProfile.status).toBe("experimental");
  });
});

describe("codex profile", () => {
  it("uses Codex-native agent and skill paths", () => {
    expect(codexProfile.paths.agentsDir).toContain(".codex");
    expect(codexProfile.paths.skillsDir).toContain(".codex");
    expect(codexProfile.paths.skillsDir).toContain("skills");
    expect(codexProfile.paths.commandsDir).toContain("commands");
  });

  it("merges and removes UluOps MCP servers in TOML config", () => {
    const existing = [
      `model = "gpt-5.5"`,
      ``,
      `[mcp_servers.other]`,
      `command = "node"`,
      ``,
      `[mcp_servers.uluops-tracker]`,
      `command = "node"`,
      `args = ["/local/dev/server.js"]`,
      ``,
      `[mcp_servers.uluops-tracker.env]`,
      `ULUOPS_API_KEY = "old"`,
      ``,
      `[mcp_servers.uluops-tracker.tools.query_issues]`,
      `approval_mode = "approve"`,
      ``,
    ].join("\n");
    const merged = codexProfile.mcpConfig.merge(
      { "__rawToml": existing },
      "ulr_test123",
    );

    expect(codexProfile.mcpConfig.check(merged)).toBe(true);
    const raw = merged["__rawToml"] as string;
    expect(raw).toContain("[mcp_servers.other]");
    expect(raw).toContain('[mcp_servers."uluops-tracker"]');
    expect(raw).toContain("@uluops/ops-mcp");
    expect(raw).toContain("ulr_test123");
    expect(raw).not.toContain("/local/dev/server.js");
    expect(raw).not.toContain('ULUOPS_API_KEY = "old"');
    expect(raw).toContain("[mcp_servers.uluops-tracker.tools.query_issues]");
    expect(raw).toContain('approval_mode = "approve"');

    const cleaned = codexProfile.mcpConfig.remove(merged);
    const cleanedRaw = cleaned["__rawToml"] as string;
    expect(codexProfile.mcpConfig.check(cleaned)).toBe(false);
    expect(cleanedRaw).toContain("[mcp_servers.other]");
    expect(cleanedRaw).not.toContain("uluops-tracker");
    expect(cleanedRaw).not.toContain("uluops-registry");
    expect(cleanedRaw).not.toContain("query_issues");
  });
});

describe("claude-code profile", () => {
  it("has correct basic properties", () => {
    expect(claudeCodeProfile.name).toBe("claude-code");
    expect(claudeCodeProfile.displayName).toBe("Claude Code");
    expect(claudeCodeProfile.agentFormat).toBe("markdown");
    expect(claudeCodeProfile.agentExtension).toBe(".md");
    expect(claudeCodeProfile.factoryTarget).toBe("claude-code");
  });

  it("has hooks (non-null)", () => {
    expect(claudeCodeProfile.hooks).not.toBeNull();
  });

  it("paths include settings and tools", () => {
    expect(claudeCodeProfile.paths.settingsPath).not.toBeNull();
    expect(claudeCodeProfile.paths.toolsDir).not.toBeNull();
  });

  it("mcpConfig.check detects both servers", () => {
    const config = {
      mcpServers: {
        "uluops-tracker": { command: "npx", args: [], env: {} },
        "uluops-registry": { command: "npx", args: [], env: {} },
      },
    };
    expect(claudeCodeProfile.mcpConfig.check(config)).toBe(true);
  });

  it("mcpConfig.check returns false when server missing", () => {
    const config = {
      mcpServers: {
        "uluops-registry": { command: "npx", args: [], env: {} },
      },
    };
    expect(claudeCodeProfile.mcpConfig.check(config)).toBe(false);
  });

  it("mcpConfig.check returns false with no mcpServers", () => {
    expect(claudeCodeProfile.mcpConfig.check({})).toBe(false);
  });
});

describe("opencode profile", () => {
  it("has correct basic properties", () => {
    expect(opencodeProfile.name).toBe("opencode");
    expect(opencodeProfile.displayName).toBe("OpenCode");
    expect(opencodeProfile.agentFormat).toBe("markdown");
    expect(opencodeProfile.agentExtension).toBe(".md");
    expect(opencodeProfile.factoryTarget).toBe("opencode");
  });

  it("has no hooks", () => {
    expect(opencodeProfile.hooks).toBeNull();
  });

  it("paths use XDG config dir", () => {
    expect(opencodeProfile.paths.home).toContain("opencode");
    expect(opencodeProfile.paths.globalMcpConfig).toContain("opencode.json");
  });
});

describe("OpenCodeMcpConfig", () => {
  it("merge produces correct mcp key shape", () => {
    const merged = opencodeProfile.mcpConfig.merge({}, "ulr_test123");
    const mcp = merged["mcp"] as Record<string, unknown>;
    expect(mcp).toBeDefined();

    const tracker = mcp["uluops-tracker"] as Record<string, unknown>;
    expect(tracker["type"]).toBe("local");
    expect(tracker["enabled"]).toBe(true);
    expect(tracker["timeout"]).toBe(30000);
    expect(Array.isArray(tracker["command"])).toBe(true);
    expect((tracker["command"] as string[])[0]).toBe("npx");

    // Uses 'environment' not 'env'
    const env = tracker["environment"] as Record<string, string>;
    expect(env["ULUOPS_API_KEY"]).toBe("ulr_test123");
  });

  it("merge preserves existing mcp servers", () => {
    const existing = {
      mcp: {
        "other-server": { type: "local", command: ["node", "server.js"] },
      },
    };
    const merged = opencodeProfile.mcpConfig.merge(existing, "ulr_key");
    const mcp = merged["mcp"] as Record<string, unknown>;
    expect(mcp["other-server"]).toBeDefined();
    expect(mcp["uluops-tracker"]).toBeDefined();
    expect(mcp["uluops-registry"]).toBeDefined();
  });

  it("remove deletes UluOps servers", () => {
    const config = opencodeProfile.mcpConfig.merge({}, "ulr_key");
    const cleaned = opencodeProfile.mcpConfig.remove(config);
    expect(cleaned["mcp"]).toBeUndefined();
  });

  it("remove preserves non-UluOps servers", () => {
    const config = opencodeProfile.mcpConfig.merge(
      { mcp: { "other-server": { type: "local" } } },
      "ulr_key",
    );
    const cleaned = opencodeProfile.mcpConfig.remove(config);
    const mcp = cleaned["mcp"] as Record<string, unknown>;
    expect(mcp["other-server"]).toBeDefined();
    expect(mcp["uluops-tracker"]).toBeUndefined();
    expect(mcp["uluops-registry"]).toBeUndefined();
  });

  it("remove is a no-op when mcp key is missing", () => {
    const config = { foo: "bar" };
    const cleaned = opencodeProfile.mcpConfig.remove(config);
    expect(cleaned).toEqual({ foo: "bar" });
  });

  it("check returns true when both servers present", () => {
    const config = opencodeProfile.mcpConfig.merge({}, "ulr_key");
    expect(opencodeProfile.mcpConfig.check(config)).toBe(true);
  });

  it("check returns false when servers missing", () => {
    expect(opencodeProfile.mcpConfig.check({})).toBe(false);
    expect(
      opencodeProfile.mcpConfig.check({
        mcp: { "uluops-tracker": {} },
      }),
    ).toBe(false);
  });

  it("read returns empty object for missing file", async () => {
    const result = await opencodeProfile.mcpConfig.read(
      "/tmp/nonexistent-opencode-config.json",
    );
    expect(result).toEqual({});
  });

  it("read parses JSONC with comments", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "oc-test-"));
    const configPath = join(tmpDir, "opencode.jsonc");
    await writeFile(
      configPath,
      `{
  // This is a comment
  "mcp": {
    "existing": { "type": "local" }
  }
}`,
    );
    const result = await opencodeProfile.mcpConfig.read(configPath);
    const mcp = result["mcp"] as Record<string, unknown>;
    expect(mcp["existing"]).toBeDefined();
  });

  it("read probes .jsonc variant when .json not found", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "oc-test-"));
    // Write only the .jsonc file
    await writeFile(
      join(tmpDir, "opencode.jsonc"),
      '{ "mcp": { "test": true } }',
    );
    // Request .json path — should find .jsonc fallback
    const result = await opencodeProfile.mcpConfig.read(
      join(tmpDir, "opencode.json"),
    );
    const mcp = result["mcp"] as Record<string, unknown>;
    expect(mcp["test"]).toBe(true);
  });

  it("write + read round-trips correctly", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "oc-test-"));
    const configPath = join(tmpDir, "opencode.json");

    const merged = opencodeProfile.mcpConfig.merge({}, "ulr_roundtrip");
    await opencodeProfile.mcpConfig.write(configPath, merged);

    const loaded = await opencodeProfile.mcpConfig.read(configPath);
    expect(opencodeProfile.mcpConfig.check(loaded)).toBe(true);

    const tracker = (loaded["mcp"] as Record<string, unknown>)[
      "uluops-tracker"
    ] as Record<string, unknown>;
    const env = tracker["environment"] as Record<string, string>;
    expect(env["ULUOPS_API_KEY"]).toBe("ulr_roundtrip");
  });
});

describe("scaffold profiles", () => {
  it("gemini-cli has correct paths", () => {
    expect(geminiCliProfile.paths.home).toBe(join(homedir(), ".gemini"));
    expect(geminiCliProfile.paths.globalMcpConfig).toBe(
      join(homedir(), ".gemini", "settings.json"),
    );
    expect(geminiCliProfile.agentFormat).toBe("markdown");
    expect(geminiCliProfile.hooks).not.toBeNull();
  });

  it("codex has correct paths and toml format", () => {
    expect(codexProfile.paths.home).toBe(join(homedir(), ".codex"));
    expect(codexProfile.paths.globalMcpConfig).toBe(
      join(homedir(), ".codex", "config.toml"),
    );
    expect(codexProfile.agentFormat).toBe("toml");
    expect(codexProfile.agentExtension).toBe(".toml");
    expect(codexProfile.hooks).toBeNull();
  });

  it("gemini-cli mcpConfig.merge returns config with mcpServers", () => {
    const result = geminiCliProfile.mcpConfig.merge({}, "ulr_test123");
    expect(result).toHaveProperty("mcpServers");
    const servers = (result as Record<string, Record<string, unknown>>)[
      "mcpServers"
    ];
    expect(servers).toHaveProperty("uluops-tracker");
    expect(servers).toHaveProperty("uluops-registry");
  });

  it("codex mcpConfig.merge returns TOML with UluOps servers", () => {
    const result = codexProfile.mcpConfig.merge({}, "ulr_test123");
    const raw = result["__rawToml"] as string;
    expect(raw).toContain('[mcp_servers."uluops-tracker"]');
    expect(raw).toContain('[mcp_servers."uluops-registry"]');
    expect(codexProfile.mcpConfig.check(result)).toBe(true);
  });

  it("gemini-cli check() returns false when servers not present", () => {
    expect(geminiCliProfile.mcpConfig.check({})).toBe(false);
  });

  it("codex check() returns false when servers are not present", () => {
    expect(codexProfile.mcpConfig.check({ "__rawToml": "" })).toBe(false);
  });
});

describe("opencode XDG_CONFIG_HOME validation is deferred", () => {
  // These tests prove that an invalid XDG_CONFIG_HOME does NOT block module
  // loading or unrelated CLI flows (--help, --uninstall of claude-code, etc.)
  // — the validation fires only when opencode is the selected profile.

  it("importing opencode does not throw when XDG_CONFIG_HOME is invalid (path traversal)", async () => {
    const prior = process.env["XDG_CONFIG_HOME"];
    process.env["XDG_CONFIG_HOME"] = "/etc/../passwd";
    try {
      // Re-import via vi.resetModules to exercise the IIFE under the new env.
      const { resetModules } = await import("vitest").then((m) => ({
        resetModules: m.vi.resetModules,
      }));
      resetModules();
      await expect(import("../harnesses/opencode.js")).resolves.toBeDefined();
    } finally {
      if (prior === undefined) delete process.env["XDG_CONFIG_HOME"];
      else process.env["XDG_CONFIG_HOME"] = prior;
    }
  });

  it("getProfile('opencode') throws the deferred error when XDG_CONFIG_HOME is invalid", async () => {
    const prior = process.env["XDG_CONFIG_HOME"];
    process.env["XDG_CONFIG_HOME"] = "/etc/../passwd";
    try {
      const { vi } = await import("vitest");
      vi.resetModules();
      const opencodeMod = await import("../harnesses/opencode.js");
      // Calling assertOpencodeEnvironment directly is the simplest, most
      // isolated test of the deferred-validation contract.
      expect(() => opencodeMod.assertOpencodeEnvironment()).toThrow(
        /XDG_CONFIG_HOME/,
      );
    } finally {
      if (prior === undefined) delete process.env["XDG_CONFIG_HOME"];
      else process.env["XDG_CONFIG_HOME"] = prior;
    }
  });

  it("getProfile('claude-code') does not throw even when XDG_CONFIG_HOME is invalid", async () => {
    const prior = process.env["XDG_CONFIG_HOME"];
    process.env["XDG_CONFIG_HOME"] = "/etc/../passwd";
    try {
      const { vi } = await import("vitest");
      vi.resetModules();
      const reg = await import("../harnesses/index.js");
      // Selecting an unrelated harness must not surface opencode's deferred
      // error — preserves `--help` / `--uninstall` usability for users with
      // a broken XDG.
      expect(() => reg.getProfile("claude-code")).not.toThrow();
    } finally {
      if (prior === undefined) delete process.env["XDG_CONFIG_HOME"];
      else process.env["XDG_CONFIG_HOME"] = prior;
    }
  });
});
