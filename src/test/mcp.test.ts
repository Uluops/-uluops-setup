import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { writeFile, readFile, mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Mock paths so installMcp/uninstallMcp write to our temp dir
let tmpDir: string;
let configPath: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "uluops-mcp-"));
  configPath = join(tmpDir, "claude.json");

  // Default stub: installMcp calls checkMcpPackageAvailability which fetches
  // the npm registry. Without this stub the test suite makes live network
  // calls — slow, flaky, and fails offline. Individual tests below override
  // this to exercise the network-failure code paths.
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response("", { status: 200 })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// Test the core logic via config-merger (already tested),
// but also test installMcp/uninstallMcp integration with real files.

import {
  mergeUluopsMcp,
  removeUluopsMcp,
  readConfig,
  writeConfig,
  checkMcpPackageAvailability,
} from "../lib/config-merger.js";
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

describe("installMcp local-scope integration", () => {
  // The local-scope branch of installMcp resolves the destination via
  // findProjectRoot() (not the explicit configPath the global branch uses) and
  // appends the local config filename to .gitignore if a .git/ marker is
  // present. This test exercises both paths end-to-end; previously the
  // local branch had zero coverage (issue STR-OMI/H).

  let localTmpDir: string;
  let savedProjectRoot: string | null = null;

  beforeEach(async () => {
    localTmpDir = await mkdtemp(join(tmpdir(), "uluops-mcp-local-"));
    // Mark localTmpDir as the project root so findProjectRoot() resolves here
    // without walking up from cwd.
    const { setProjectRoot } = await import("../lib/paths.js");
    savedProjectRoot = null;
    setProjectRoot(localTmpDir);
    // Create the .git marker so addToGitignore runs (the access() probe
    // gates the gitignore write on this marker).
    const { mkdir } = await import("node:fs/promises");
    await mkdir(join(localTmpDir, ".git"), { recursive: true });
  });

  afterEach(async () => {
    const { setProjectRoot } = await import("../lib/paths.js");
    setProjectRoot(savedProjectRoot);
  });

  it("writes the local .mcp.json under the project root and appends .gitignore", async () => {
    const profile = {
      name: "claude-code",
      displayName: "Claude Code",
      paths: {
        globalMcpConfig: "/nowhere/.claude.json",
        localMcpConfig: ".mcp.json",
      },
      mcpConfig: {
        read: readConfig,
        merge: mergeUluopsMcp,
        write: writeConfig,
      },
    } as unknown as HarnessProfile;

    const result = await installMcp(profile, "ulr_local", "local", false);

    expect(result.scope).toBe("local");
    expect(result.configPath).toBe(join(localTmpDir, ".mcp.json"));

    const written = JSON.parse(
      await readFile(join(localTmpDir, ".mcp.json"), "utf-8"),
    );
    expect(written.mcpServers["uluops-tracker"].env.ULUOPS_API_KEY).toBe(
      "ulr_local",
    );

    const gitignore = await readFile(
      join(localTmpDir, ".gitignore"),
      "utf-8",
    );
    expect(gitignore).toContain(".mcp.json");
  });

  it("skips .gitignore append when no .git directory exists", async () => {
    // Remove the .git marker created in beforeEach.
    const { rm, access: probe } = await import("node:fs/promises");
    await rm(join(localTmpDir, ".git"), { recursive: true });

    const profile = {
      name: "claude-code",
      displayName: "Claude Code",
      paths: {
        globalMcpConfig: "/nowhere/.claude.json",
        localMcpConfig: ".mcp.json",
      },
      mcpConfig: {
        read: readConfig,
        merge: mergeUluopsMcp,
        write: writeConfig,
      },
    } as unknown as HarnessProfile;

    await installMcp(profile, "ulr_local", "local", false);

    // .mcp.json still written...
    const written = JSON.parse(
      await readFile(join(localTmpDir, ".mcp.json"), "utf-8"),
    );
    expect(written.mcpServers["uluops-tracker"]).toBeDefined();

    // ...but .gitignore is NOT created when there's no git repo.
    await expect(probe(join(localTmpDir, ".gitignore"))).rejects.toThrow();
  });

  it("dry-run does not write the local config or .gitignore", async () => {
    const profile = {
      name: "claude-code",
      displayName: "Claude Code",
      paths: {
        globalMcpConfig: "/nowhere/.claude.json",
        localMcpConfig: ".mcp.json",
      },
      mcpConfig: {
        read: readConfig,
        merge: mergeUluopsMcp,
        write: writeConfig,
      },
    } as unknown as HarnessProfile;

    await installMcp(profile, "ulr_local", "local", true);

    const { access: probe } = await import("node:fs/promises");
    await expect(probe(join(localTmpDir, ".mcp.json"))).rejects.toThrow();
    await expect(probe(join(localTmpDir, ".gitignore"))).rejects.toThrow();
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

describe("checkMcpPackageAvailability", () => {
  // Replaces the prior live-npm-registry calls that ran on every install
  // integration test. All paths stub fetch so the suite is offline-clean.

  it("reports both packages available on 200 OK", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("", { status: 200 })),
    );
    const result = await checkMcpPackageAvailability();
    expect(result.available).toEqual([
      "@uluops/ops-mcp",
      "@uluops/registry-mcp",
    ]);
    expect(result.missing).toEqual([]);
  });

  it("reports package as missing on 404 (unpublished package)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("", { status: 404 })),
    );
    const result = await checkMcpPackageAvailability();
    expect(result.available).toEqual([]);
    expect(result.missing).toEqual([
      "@uluops/ops-mcp",
      "@uluops/registry-mcp",
    ]);
  });

  it("annotates missing entry with network reason on AbortError (timeout)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(
        Object.assign(new Error("The operation was aborted"), {
          name: "AbortError",
        }),
      ),
    );
    const result = await checkMcpPackageAvailability();
    expect(result.available).toEqual([]);
    // Each entry should carry the package name AND a network reason — never
    // a bare "unknown" placeholder (the regression this test guards).
    for (const entry of result.missing) {
      expect(entry).toMatch(/^@uluops\/(ops-mcp|registry-mcp)/);
      expect(entry).toContain("(network:");
      expect(entry).not.toContain("unknown");
    }
    expect(result.missing).toHaveLength(2);
  });

  it("annotates missing entry with network reason on TypeError (DNS / ECONNREFUSED)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("fetch failed")),
    );
    const result = await checkMcpPackageAvailability();
    expect(result.available).toEqual([]);
    for (const entry of result.missing) {
      expect(entry).toContain("(network: fetch failed)");
    }
  });

  it("preserves per-index correspondence when one package succeeds and the other fails", async () => {
    // Both packages get HEAD'd in parallel via Promise.allSettled. The fix in
    // config-merger.ts pairs results to MCP_PACKAGES by index, not by closing
    // over the package name. This test exercises mixed outcomes to lock that
    // pairing — without it, a regression could re-label which package is
    // missing.
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("ops-mcp")) return new Response("", { status: 200 });
      return new Response("", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const result = await checkMcpPackageAvailability();
    expect(result.available).toEqual(["@uluops/ops-mcp"]);
    expect(result.missing).toEqual(["@uluops/registry-mcp"]);
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
