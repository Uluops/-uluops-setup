import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { writeFile, unlink, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const tmpDir = join(tmpdir(), "uluops-manifest-test-" + Date.now());
const manifestPath = join(tmpDir, "manifest.json");
const legacyPath = join(tmpDir, "legacy-manifest.json");

vi.mock("../lib/paths.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../lib/paths.js")>();
  return {
    ...original,
    getManifestPath: () => manifestPath,
    getLegacyManifestPath: () => legacyPath,
    getUluopsDir: () => tmpDir,
  };
});

const { loadManifest, saveManifest, deleteManifest, validateManifest } = await import(
  "../lib/manifest.js"
);

const sampleManifest = {
  version: "0.3.0",
  installedAt: "2026-05-01T00:00:00.000Z",
  shellModified: false,
  harnesses: {
    "claude-code": {
      installedAt: "2026-05-01T00:00:00.000Z",
      setupVersion: "0.3.0",
      mcpScope: "global" as const,
      mcpConfigPath: "/home/user/.claude.json",
      defsScope: "global" as const,
      defsPath: "/home/user/.claude",
      agents: ["code-validator-agent.md"],
      commands: ["agents/validate.md"],
      hooksInstalled: true,
    },
  },
};

const legacyManifest = {
  version: "0.2.0",
  installedAt: "2026-04-01T00:00:00.000Z",
  mcpScope: "global",
  mcpConfigPath: "/home/user/.claude.json",
  defsScope: "global",
  defsPath: "/home/user/.claude",
  shellModified: false,
  agents: ["code-validator-agent.md"],
  commands: ["agents/validate.md"],
  metricsHookInstalled: true,
};

beforeEach(async () => {
  await mkdir(tmpDir, { recursive: true });
});

afterEach(async () => {
  for (const p of [manifestPath, legacyPath]) {
    try {
      await unlink(p);
    } catch {
      // may not exist
    }
  }
});

describe("loadManifest", () => {
  it("returns null when manifest does not exist", async () => {
    const result = await loadManifest();
    expect(result).toBeNull();
  });

  it("returns parsed manifest when new-format file exists", async () => {
    await writeFile(manifestPath, JSON.stringify(sampleManifest, null, 2));
    const result = await loadManifest();
    expect(result).toEqual(sampleManifest);
  });

  it("migrates legacy manifest to new format", async () => {
    await writeFile(legacyPath, JSON.stringify(legacyManifest, null, 2));
    const result = await loadManifest();
    expect(result).not.toBeNull();
    expect(result!.harnesses).toBeDefined();
    expect(result!.harnesses["claude-code"]).toBeDefined();
    expect(result!.harnesses["claude-code"]!.agents).toEqual([
      "code-validator-agent.md",
    ]);
    expect(result!.harnesses["claude-code"]!.hooksInstalled).toBe(true);
  });

  it("returns null on malformed JSON", async () => {
    await writeFile(manifestPath, "{ invalid json }");
    const result = await loadManifest();
    expect(result).toBeNull();
  });
});

describe("saveManifest", () => {
  it("writes manifest with contentHash", async () => {
    await saveManifest(sampleManifest);
    const raw = await import("node:fs/promises").then((fs) =>
      fs.readFile(manifestPath, "utf-8"),
    );
    const parsed = JSON.parse(raw);
    expect(parsed.harnesses).toBeDefined();
    expect(parsed.contentHash).toBeDefined();
    expect(typeof parsed.contentHash).toBe("string");
  });

  it("round-trips correctly through save and load", async () => {
    await saveManifest(sampleManifest);
    const loaded = await loadManifest();
    expect(loaded).not.toBeNull();
    expect(loaded!.harnesses["claude-code"]!.agents).toEqual(
      sampleManifest.harnesses["claude-code"].agents,
    );
  });
});

describe("validateManifest", () => {
  it("reports errors for missing MCP config and defs paths", async () => {
    const manifest = {
      ...sampleManifest,
      harnesses: {
        "claude-code": {
          ...sampleManifest.harnesses["claude-code"],
          mcpConfigPath: join(tmpDir, "nonexistent-mcp.json"),
          defsPath: join(tmpDir, "nonexistent-defs"),
        },
      },
    };
    const result = await validateManifest(manifest);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
    expect(result.errors.some((e) => e.includes("MCP config"))).toBe(true);
    expect(result.errors.some((e) => e.includes("Defs path"))).toBe(true);
  });

  it("reports warnings for missing agent files", async () => {
    // Create the defs path and MCP config so those pass
    const defsPath = join(tmpDir, "defs");
    const agentsDir = join(defsPath, "agents");
    await mkdir(agentsDir, { recursive: true });
    const mcpPath = join(tmpDir, "mcp.json");
    await writeFile(mcpPath, "{}");

    const manifest = {
      ...sampleManifest,
      harnesses: {
        "claude-code": {
          ...sampleManifest.harnesses["claude-code"],
          mcpConfigPath: mcpPath,
          defsPath,
          agents: ["missing-agent.md"],
          commands: [],
        },
      },
    };
    const result = await validateManifest(manifest);
    expect(result.valid).toBe(true); // Missing agents are warnings, not errors
    expect(result.warnings.some((w) => w.includes("missing-agent.md"))).toBe(true);
  });

  it("passes validation when all paths exist", async () => {
    const defsPath = join(tmpDir, "valid-defs");
    const agentsDir = join(defsPath, "agents");
    await mkdir(agentsDir, { recursive: true });
    await writeFile(join(agentsDir, "code-validator-agent.md"), "content");
    const mcpPath = join(tmpDir, "valid-mcp.json");
    await writeFile(mcpPath, "{}");

    // Save a manifest so contentHash can be verified
    const manifest = {
      ...sampleManifest,
      harnesses: {
        "claude-code": {
          ...sampleManifest.harnesses["claude-code"],
          mcpConfigPath: mcpPath,
          defsPath,
          agents: ["code-validator-agent.md"],
          commands: [],
        },
      },
    };
    await saveManifest(manifest);
    const loaded = await loadManifest();
    const result = await validateManifest(loaded!);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});

describe("deleteManifest", () => {
  it("deletes existing manifest", async () => {
    await writeFile(manifestPath, JSON.stringify(sampleManifest));
    await deleteManifest();
    const result = await loadManifest();
    expect(result).toBeNull();
  });

  it("does not throw if manifest does not exist", async () => {
    await expect(deleteManifest()).resolves.toBeUndefined();
  });
});
