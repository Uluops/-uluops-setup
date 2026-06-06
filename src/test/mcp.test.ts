import { describe, it, expect, beforeEach, vi } from "vitest";
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

describe("ensureGitignoreEntry", () => {
  let gitignorePath: string;

  beforeEach(() => {
    gitignorePath = join(tmpDir, ".gitignore");
  });

  it("creates a new .gitignore with just the entry when file does not exist (ENOENT)", async () => {
    const { ensureGitignoreEntry } = await import("../steps/mcp.js");
    await ensureGitignoreEntry(gitignorePath, ".mcp.json");
    const content = await readFile(gitignorePath, "utf-8");
    expect(content).toBe(".mcp.json\n");
  });

  it("appends the entry to an existing .gitignore preserving prior content", async () => {
    await writeFile(gitignorePath, "node_modules\n*.log\n");
    const { ensureGitignoreEntry } = await import("../steps/mcp.js");
    await ensureGitignoreEntry(gitignorePath, ".mcp.json");
    const content = await readFile(gitignorePath, "utf-8");
    expect(content).toContain("node_modules");
    expect(content).toContain("*.log");
    expect(content).toContain(".mcp.json");
  });

  it("is idempotent when the entry already exists", async () => {
    const initial = "node_modules\n.mcp.json\n*.log\n";
    await writeFile(gitignorePath, initial);
    const { ensureGitignoreEntry } = await import("../steps/mcp.js");
    await ensureGitignoreEntry(gitignorePath, ".mcp.json");
    const content = await readFile(gitignorePath, "utf-8");
    expect(content).toBe(initial);
  });

  it("does NOT clobber an existing .gitignore when read fails with a non-ENOENT error (EACCES, EISDIR, EBUSY)", async () => {
    const original = "important user content\n.env\nsecrets/\n";
    await writeFile(gitignorePath, original);
    const { ensureGitignoreEntry } = await import("../steps/mcp.js");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const failingReader = () =>
      Promise.reject(
        Object.assign(new Error("EACCES: permission denied, open '.gitignore'"), {
          code: "EACCES",
        }),
      );

    await ensureGitignoreEntry(gitignorePath, ".mcp.json", failingReader);

    // File on disk must be unchanged — this is the regression guard
    const content = await readFile(gitignorePath, "utf-8");
    expect(content).toBe(original);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("could not read"),
    );

    warnSpy.mockRestore();
  });

  it("creates the file on injected ENOENT (regression: ENOENT path still works under injection)", async () => {
    const { ensureGitignoreEntry } = await import("../steps/mcp.js");
    const enoentReader = () =>
      Promise.reject(
        Object.assign(new Error("ENOENT: no such file"), { code: "ENOENT" }),
      );

    await ensureGitignoreEntry(gitignorePath, ".mcp.json", enoentReader);
    const content = await readFile(gitignorePath, "utf-8");
    expect(content).toBe(".mcp.json\n");
  });
});
