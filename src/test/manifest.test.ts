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

describe("manifest schema invariants", () => {
  it("rejects a manifest with empty harnesses: {} (vacuous-truth regression)", async () => {
    // Truncated/partial-write produced a structurally complete top level but
    // zero harness entries. The previous isNewManifest used a for-of loop
    // that vacuously accepted the empty case, so uninstall would later
    // delete this manifest and report success while leaving every MCP
    // config, agent file, hook, and shell export in place.
    const emptyHarnesses = {
      version: "0.7.1",
      installedAt: "2026-06-06T00:00:00.000Z",
      shellModified: false,
      harnesses: {},
    };
    await writeFile(manifestPath, JSON.stringify(emptyHarnesses));
    const result = await loadManifest();
    expect(result).toBeNull();
  });
});

describe("validateManifest hash check", () => {
  it("does not emit a false 'Cannot read manifest file' warning when only legacy manifest exists on disk", async () => {
    // Reproduces the bug: user has only the legacy manifest. loadManifest()
    // migrates it in-memory but never writes the new path. validateManifest
    // used to hardcode getManifestPath() (new), the read failed, and a
    // misleading warning fired on every uninstall.
    await writeFile(legacyPath, JSON.stringify(legacyManifest));
    const manifest = await loadManifest();
    expect(manifest).not.toBeNull();
    const result = await validateManifest(manifest!);
    expect(
      result.warnings.find((w) => w.includes("Cannot read manifest file")),
    ).toBeUndefined();
  });

  it("still detects hash mismatch when the on-disk new-path manifest has been tampered with", async () => {
    // saveManifest writes a canonical form with contentHash. We then mutate
    // a top-level field after the fact to simulate user editing — the hash
    // must mismatch and the warning must fire.
    await saveManifest(sampleManifest);
    const raw = await import("node:fs/promises").then((m) =>
      m.readFile(manifestPath, "utf-8"),
    );
    const tampered = raw.replace(
      '"shellModified": false',
      '"shellModified": true',
    );
    await writeFile(manifestPath, tampered);
    const reloaded = await loadManifest();
    expect(reloaded).not.toBeNull();
    const result = await validateManifest(reloaded!);
    expect(
      result.warnings.some((w) => w.includes("content hash mismatch")),
    ).toBe(true);
  });

  /**
   * Tamper-detection negative + edge cases. The "mismatch fires the warning"
   * branch was covered above, but the rest of the conditional shape was not:
   *  - legitimate hash match must NOT warn
   *  - missing contentHash key (legacy / pre-hash manifest) must NOT warn
   *  - unparseable JSON on disk warns with the parse-error message
   *  - non-string contentHash (0/false/"") warns with the type message
   *    (locks the SEM-INC/M fix — pre-fix, truthiness check would skip
   *    tamper detection silently)
   *
   * See tracker issues SEM-COM/M ("Manifest content-hash tamper-detection
   * branch untested") and SEM-INC/M ("Manifest contentHash truthiness check
   * accepts 0/false/empty/missing").
   */
  it("does not warn when the on-disk manifest hash matches", async () => {
    await saveManifest(sampleManifest);
    const reloaded = await loadManifest();
    const result = await validateManifest(reloaded!);
    expect(
      result.warnings.some((w) => w.includes("content hash mismatch")),
    ).toBe(false);
    expect(
      result.warnings.some((w) => w.includes("wrong type")),
    ).toBe(false);
  });

  it("does not warn when the manifest predates contentHash (legacy / missing key)", async () => {
    // Hand-craft a new-format manifest with NO contentHash field — represents
    // either a legacy hand-edited file or a setup version that predates the
    // hash. Validation should skip tamper detection silently.
    const noHash = { ...sampleManifest };
    await writeFile(manifestPath, JSON.stringify(noHash, null, 2) + "\n");
    const reloaded = await loadManifest();
    const result = await validateManifest(reloaded!);
    expect(
      result.warnings.some((w) => w.includes("content hash mismatch")),
    ).toBe(false);
    expect(
      result.warnings.some((w) => w.includes("wrong type")),
    ).toBe(false);
  });

  it("warns when the manifest file on disk is unparseable JSON", async () => {
    // loadManifest returns the in-memory parsed form earlier (via a re-read
    // of the same path). To trigger the catch in validateManifest, we
    // saveManifest first (so the path exists), keep the loaded in-memory
    // manifest, then corrupt the file on disk.
    await saveManifest(sampleManifest);
    const loaded = await loadManifest();
    expect(loaded).not.toBeNull();
    await writeFile(manifestPath, "not json{{{");
    const result = await validateManifest(loaded!);
    expect(
      result.warnings.some((w) => w.includes("unparseable JSON")),
    ).toBe(true);
  });

  it("warns when contentHash is present but not a string (0 / false / empty)", async () => {
    // Pre-fix (SEM-INC/M), `if (storedHash && ...)` would skip tamper
    // detection silently for any falsy contentHash value — a malformed
    // manifest with `contentHash: 0` could bypass the check entirely. Now
    // a non-string-but-present value must warn.
    const withFalsy = { ...sampleManifest, contentHash: 0 };
    await writeFile(manifestPath, JSON.stringify(withFalsy, null, 2) + "\n");
    const loaded = await loadManifest();
    expect(loaded).not.toBeNull();
    const result = await validateManifest(loaded!);
    expect(
      result.warnings.some((w) => w.includes("wrong type")),
    ).toBe(true);
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
