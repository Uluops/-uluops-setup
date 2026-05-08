import { describe, it, expect, beforeEach } from "vitest";
import { writeFile, readFile, mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Mock paths so installMcp/uninstallMcp write to our temp dir
let tmpDir: string;
let configPath: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "uluops-mcp-"));
  configPath = join(tmpDir, "claude.json");
});

// Test the core logic via config-merger (already tested),
// but also test installMcp/uninstallMcp integration with real files.

import { mergeUluopsMcp, removeUluopsMcp, readConfig, writeConfig } from "../lib/config-merger.js";
import { installMcp, uninstallMcp } from "../steps/mcp.js";
import type { HarnessProfile } from "../harnesses/index.js";

describe("installMcp integration", () => {
  it("orchestrates MCP installation for a profile", async () => {
    const profile = {
      name: "claude-code",
      displayName: "Claude Code",
      paths: {
        globalMcpConfig: configPath,
      },
      mcpConfig: {
        read: readConfig,
        merge: mergeUluopsMcp,
        write: writeConfig,
      }
    } as unknown as HarnessProfile;

    const result = await installMcp(profile, "ulr_test123", "global", false);

    expect(result.configPath).toBe(configPath);
    const written = JSON.parse(await readFile(configPath, "utf-8"));
    expect(written.mcpServers["uluops-tracker"]).toBeDefined();
  });
});

describe("uninstallMcp integration", () => {
  it("orchestrates MCP removal for a profile", async () => {
    const profile = {
      name: "claude-code",
      displayName: "Claude Code",
      paths: {
        globalMcpConfig: configPath,
      },
      mcpConfig: {
        read: readConfig,
        merge: mergeUluopsMcp,
        remove: removeUluopsMcp,
        write: writeConfig,
      }
    } as unknown as HarnessProfile;

    // First install
    await installMcp(profile, "ulr_test123", "global", false);

    // Then uninstall
    await uninstallMcp(profile, configPath);

    const written = JSON.parse(await readFile(configPath, "utf-8"));
    expect(written.mcpServers?.["uluops-tracker"]).toBeUndefined();
  });
});

describe("mergeUluopsMcp logic", () => {
  it("creates config file from scratch", async () => {
    const config = await readConfig(configPath);
    expect(config).toEqual({});

    const merged = mergeUluopsMcp(config, "ulr_test123");
    await writeConfig(configPath, merged);

    const written = JSON.parse(await readFile(configPath, "utf-8"));
    expect(written.mcpServers["uluops-tracker"]).toBeDefined();
    expect(written.mcpServers["uluops-registry"]).toBeDefined();
    expect(written.mcpServers["uluops-tracker"].env.ULUOPS_API_KEY).toBe("ulr_test123");
  });

  it("preserves existing config keys through install/uninstall cycle", async () => {
    const existing = {
      numStartups: 5,
      mcpServers: { "my-server": { command: "node", args: ["server.js"] } },
    };
    await writeFile(configPath, JSON.stringify(existing));

    // Install
    const config = await readConfig(configPath);
    const merged = mergeUluopsMcp(config, "ulr_abc");
    await writeConfig(configPath, merged);

    let result = JSON.parse(await readFile(configPath, "utf-8"));
    expect(result.numStartups).toBe(5);
    expect(result.mcpServers["my-server"]).toBeDefined();
    expect(result.mcpServers["uluops-tracker"]).toBeDefined();

    // Uninstall
    const config2 = await readConfig(configPath);
    const cleaned = removeUluopsMcp(config2);
    await writeConfig(configPath, cleaned);

    result = JSON.parse(await readFile(configPath, "utf-8"));
    expect(result.numStartups).toBe(5);
    expect(result.mcpServers["my-server"]).toBeDefined();
    expect(result.mcpServers["uluops-tracker"]).toBeUndefined();
    expect(result.mcpServers["uluops-registry"]).toBeUndefined();
  });

  it("throws on malformed config to prevent silent data loss", async () => {
    await writeFile(configPath, "not json{{{");
    await expect(readConfig(configPath)).rejects.toThrow("invalid JSON");
  });
});
