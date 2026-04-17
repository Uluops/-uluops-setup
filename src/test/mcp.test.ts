import { describe, it, expect, beforeEach, vi } from "vitest";
import { writeFile, readFile, mkdir, mkdtemp } from "node:fs/promises";
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

describe("installMcp integration", () => {
  it("creates config file from scratch", async () => {
    const config = await readConfig(configPath);
    expect(config).toEqual({});

    const merged = mergeUluopsMcp(config, "ulr_test123");
    await writeConfig(configPath, merged);

    const written = JSON.parse(await readFile(configPath, "utf-8"));
    expect(written.mcpServers["uluops-tracker"]).toBeDefined();
    expect(written.mcpServers["uluops-registry"]).toBeDefined();
    expect(written.mcpServers["uluops-tracker"].env.ULUOPS_TRACKER_API_KEY).toBe("ulr_test123");
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

  it("handles malformed config gracefully", async () => {
    await writeFile(configPath, "not json{{{");

    const config = await readConfig(configPath);
    expect(config).toEqual({});

    const merged = mergeUluopsMcp(config, "ulr_test");
    await writeConfig(configPath, merged);

    const result = JSON.parse(await readFile(configPath, "utf-8"));
    expect(result.mcpServers["uluops-tracker"]).toBeDefined();
  });
});
