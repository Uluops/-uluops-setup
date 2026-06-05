import { readFile, unlink, access, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { getManifestPath, getLegacyManifestPath, getUluopsDir } from "./paths.js";
import { fileHash } from "./hash.js";
import { atomicWrite } from "./atomic-write.js";

/**
 * Identifier for a single harness installation in the manifest.
 *
 * Today this is the profile name (e.g. `"claude-code"`), assuming a
 * one-to-one mapping between profiles and installations. The day that
 * assumption breaks — multiple Claude Code installs (project vs global,
 * NVM versions, parallel beta channels) — this becomes the seam where
 * fracture surfaces. When that happens, the right migration is to extend
 * keys to `{profile.name}@{stable-instance-id}` (e.g. a hash of toolsDir)
 * rather than overwriting silently. The type alias exists so the
 * assumption is documented in the schema, not the comments.
 */
export type HarnessInstanceKey = string;

/** Per-harness installation state. */
export interface HarnessManifest {
  installedAt: string;
  setupVersion: string;
  mcpScope: "global" | "local";
  mcpConfigPath: string;
  defsScope: "global" | "local";
  defsPath: string;
  agents: string[];
  commands: string[];
  hooksInstalled: boolean;
  /**
   * Version of @uluops/agent-metrics whose dist/ was copied into the harness tree.
   * Null when hooks are not installed or when the manifest predates this field.
   * Verify uses this to detect drift between installed and currently-resolvable versions —
   * the shared version ledger across the setup↔agent-metrics seam.
   */
  hooksInstalledVersion?: string | null;
}

/** Top-level manifest with per-harness entries. */
export interface Manifest {
  version: string;
  installedAt: string;
  shellModified: boolean;
  harnesses: Record<HarnessInstanceKey, HarnessManifest>;
  /**
   * Tracks whether `@uluops/cli` was installed globally by this setup run.
   * Null/false when not installed by setup (user-installed or never installed).
   * Uninstall only removes the global package when this is true — we don't
   * remove what we didn't install.
   */
  cliInstalled?: boolean;
  /** Version reported by `ulu --version` at install time, for drift detection. */
  cliInstalledVersion?: string | null;
  contentHash?: string;
}

/** Legacy manifest shape (pre-multi-harness). */
interface LegacyManifest {
  version: string;
  installedAt: string;
  mcpScope: "global" | "local";
  mcpConfigPath: string;
  defsScope: "global" | "local";
  defsPath: string;
  shellModified: boolean;
  agents: string[];
  commands: string[];
  metricsHookInstalled?: boolean;
  contentHash?: string;
}

function isNewManifest(obj: unknown): obj is Manifest {
  if (typeof obj !== "object" || obj === null) return false;
  const m = obj as Record<string, unknown>;
  if (
    typeof m["version"] !== "string" ||
    typeof m["installedAt"] !== "string" ||
    typeof m["shellModified"] !== "boolean" ||
    typeof m["harnesses"] !== "object" ||
    m["harnesses"] === null
  ) return false;

  // Validate at least one harness entry has required fields
  const harnesses = m["harnesses"] as Record<string, unknown>;
  for (const h of Object.values(harnesses)) {
    if (typeof h !== "object" || h === null) return false;
    const hm = h as Record<string, unknown>;
    if (typeof hm["mcpConfigPath"] !== "string" || typeof hm["defsPath"] !== "string") return false;
    if (!Array.isArray(hm["agents"]) || !Array.isArray(hm["commands"])) return false;
  }
  return true;
}

function isLegacyManifest(obj: unknown): obj is LegacyManifest {
  if (typeof obj !== "object" || obj === null) return false;
  const m = obj as Record<string, unknown>;
  return (
    typeof m["version"] === "string" &&
    typeof m["installedAt"] === "string" &&
    typeof m["mcpConfigPath"] === "string" &&
    typeof m["defsPath"] === "string" &&
    Array.isArray(m["agents"]) &&
    Array.isArray(m["commands"]) &&
    !("harnesses" in m)
  );
}

function migrateManifest(old: LegacyManifest): Manifest {
  return {
    version: old.version,
    installedAt: old.installedAt,
    shellModified: old.shellModified,
    harnesses: {
      "claude-code": {
        installedAt: old.installedAt,
        setupVersion: old.version,
        mcpScope: old.mcpScope,
        mcpConfigPath: old.mcpConfigPath,
        defsScope: old.defsScope,
        defsPath: old.defsPath,
        agents: old.agents,
        commands: old.commands,
        hooksInstalled: old.metricsHookInstalled ?? false,
      },
    },
  };
}

export interface ManifestValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/** Validate a manifest against the current filesystem state. */
export async function validateManifest(
  manifest: Manifest,
): Promise<ManifestValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const [harnessName, hm] of Object.entries(manifest.harnesses)) {
    const mcpExists = await pathExists(hm.mcpConfigPath);
    if (!mcpExists) {
      errors.push(
        `[${harnessName}] MCP config path does not exist: ${hm.mcpConfigPath}`,
      );
    }

    const defsExists = await pathExists(hm.defsPath);
    if (!defsExists) {
      errors.push(
        `[${harnessName}] Defs path does not exist: ${hm.defsPath}`,
      );
    }

    if (hm.agents.length > 0 && defsExists) {
      const missing = await findMissingFiles(
        hm.defsPath,
        "agents",
        hm.agents,
      );
      if (missing.length > 0) {
        warnings.push(
          `[${harnessName}] Agent files missing from disk: ${missing.join(", ")}`,
        );
      }
    }

    if (hm.commands.length > 0 && defsExists) {
      const missing = await findMissingFiles(
        hm.defsPath,
        "commands",
        hm.commands,
      );
      if (missing.length > 0) {
        warnings.push(
          `[${harnessName}] Command files missing from disk: ${missing.join(", ")}`,
        );
      }
    }
  }

  const manifestPath = getManifestPath();
  try {
    const raw = await readFile(manifestPath, "utf-8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const { contentHash: storedHash, ...withoutHash } = parsed;
    const canonical = JSON.stringify(withoutHash, null, 2) + "\n";
    const currentHash = fileHash(canonical);
    if (storedHash && storedHash !== currentHash) {
      warnings.push(
        "Manifest file has been modified since installation — content hash mismatch",
      );
    }
  } catch {
    warnings.push("Cannot read manifest file to verify content hash");
  }

  return { valid: errors.length === 0, errors, warnings };
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function findMissingFiles(
  baseDir: string,
  subDir: string,
  files: string[],
): Promise<string[]> {
  const results = await Promise.all(
    files.map(async (file) => ({
      file,
      exists: await pathExists(join(baseDir, subDir, file)),
    })),
  );
  return results.filter((r) => !r.exists).map((r) => r.file);
}

async function readManifestFile(path: string): Promise<unknown | null> {
  try {
    const raw = await readFile(path, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Load the install manifest. Tries new location first, falls back to legacy, auto-migrates. */
export async function loadManifest(): Promise<Manifest | null> {
  // Try new location first
  const newData = await readManifestFile(getManifestPath());
  if (newData && isNewManifest(newData)) return newData;

  // Fall back to legacy location
  const legacyData = await readManifestFile(getLegacyManifestPath());
  if (legacyData && isLegacyManifest(legacyData)) {
    return migrateManifest(legacyData);
  }
  // Also check if legacy location has new format (written by newer version but not yet moved)
  if (legacyData && isNewManifest(legacyData)) return legacyData;

  return null;
}

/** Save the install manifest to ~/.uluops/manifest.json. Creates directory if needed. */
export async function saveManifest(manifest: Manifest): Promise<void> {
  const dir = getUluopsDir();
  await mkdir(dir, { recursive: true });

  // Serialize without hash, compute hash of that content, embed it.
  // Validation compares the stored hash against a re-hash of the file
  // with contentHash stripped, so both sides agree on the input.
  const { contentHash: _, ...withoutHash } = manifest;
  const canonical = JSON.stringify(withoutHash, null, 2) + "\n";
  const hash = fileHash(canonical);
  const final = JSON.stringify({ ...withoutHash, contentHash: hash }, null, 2) + "\n";
  await atomicWrite(getManifestPath(), final);
}

/** Delete the install manifest file from disk. Tries both locations. */
export async function deleteManifest(): Promise<void> {
  for (const path of [getManifestPath(), getLegacyManifestPath()]) {
    try {
      await unlink(path);
    } catch {
      // Already gone
    }
  }
}
