import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { writeFile, unlink, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

// We need to control the manifest path, so we mock paths.js
const tmpDir = join(tmpdir(), "uluops-manifest-test-" + Date.now());
const manifestPath = join(tmpDir, "uluops-manifest.json");

vi.mock("../lib/paths.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../lib/paths.js")>();
  return {
    ...original,
    getManifestPath: () => manifestPath,
  };
});

// Import after mock is set up
const { loadManifest, saveManifest, deleteManifest } = await import(
  "../lib/manifest.js"
);

const sampleManifest = {
  version: "0.1.0",
  installedAt: "2026-03-08T00:00:00.000Z",
  mcpScope: "global" as const,
  mcpConfigPath: "/home/user/.claude.json",
  defsScope: "global" as const,
  defsPath: "/home/user/.claude",
  shellModified: false,
  agents: ["code-validator-agent.md"],
  commands: ["agents/validate.md"],
};

beforeEach(async () => {
  await mkdir(tmpDir, { recursive: true });
});

afterEach(async () => {
  try {
    await unlink(manifestPath);
  } catch {
    // may not exist
  }
});

describe("loadManifest", () => {
  it("returns null when manifest does not exist", async () => {
    const result = await loadManifest();
    expect(result).toBeNull();
  });

  it("returns parsed manifest when file exists", async () => {
    await writeFile(manifestPath, JSON.stringify(sampleManifest, null, 2));
    const result = await loadManifest();
    expect(result).toEqual(sampleManifest);
  });

  it("returns null on malformed JSON", async () => {
    await writeFile(manifestPath, "{ invalid json }");
    const result = await loadManifest();
    expect(result).toBeNull();
  });
});

describe("saveManifest", () => {
  it("writes manifest as formatted JSON", async () => {
    await saveManifest(sampleManifest);
    const raw = await import("node:fs/promises").then((fs) =>
      fs.readFile(manifestPath, "utf-8"),
    );
    const parsed = JSON.parse(raw);
    expect(parsed).toEqual(sampleManifest);
  });

  it("round-trips correctly through save and load", async () => {
    await saveManifest(sampleManifest);
    const loaded = await loadManifest();
    expect(loaded).toEqual(sampleManifest);
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
