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

const { loadManifest, saveManifest, deleteManifest } = await import(
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
    expect(result!.harnesses["claude-code"].agents).toEqual([
      "code-validator-agent.md",
    ]);
    expect(result!.harnesses["claude-code"].hooksInstalled).toBe(true);
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
    expect(loaded!.harnesses["claude-code"].agents).toEqual(
      sampleManifest.harnesses["claude-code"].agents,
    );
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
