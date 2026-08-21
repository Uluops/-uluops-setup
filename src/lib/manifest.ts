import { readFile, unlink, access, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { getManifestPath, getLegacyManifestPath, getUluopsDir } from "./paths.js";
import { fileHash } from "./hash.js";
import { atomicWrite } from "./atomic-write.js";
import { isEnoent } from "./file-ops.js";

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

/**
 * Names of per-harness pipeline steps that can throw before producing a
 * complete result. Recorded in `HarnessManifest.partial` so verify can warn
 * and re-runs can re-prompt conflicts (spec §7.6.3). `configureMcpStep` is
 * NOT in this set — an MCP throw produces no manifest entry at all because
 * the entry depends on the MCP-derived `mcpConfigPath`.
 */
export type PartialStep = "agents" | "commands" | "skills" | "metrics";

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
  skills?: string[];
  hooksInstalled: boolean;
  /**
   * Version of @uluops/agent-metrics whose dist/ was copied into the harness tree.
   * Null when hooks are not installed or when the manifest predates this field.
   * Verify uses this to detect drift between installed and currently-resolvable versions —
   * the shared version ledger across the setup↔agent-metrics seam.
   */
  hooksInstalledVersion?: string | null;
  /**
   * When non-null, names the per-harness pipeline step that threw before
   * producing a complete result. Earlier steps' file lists are accurate;
   * later steps were never attempted. Verify surfaces this as a WARNING.
   * Re-run treats a partial entry as "checkConflicts must run again" (the
   * user never confirmed it on the failing run — spec §7.6.5).
   *
   * Absent (undefined) on manifests written by pre-multi-target versions —
   * those harnesses are assumed fully installed.
   */
  partial?: PartialStep | null;
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
  /**
   * Tracks whether `@uluops/agent-metrics` was installed globally by this
   * setup run. Same ownership semantics as `cliInstalled` — uninstall only
   * removes the global package when this is true.
   */
  agentMetricsCliInstalled?: boolean;
  /** Version reported by `agent-metrics --version` at install time. */
  agentMetricsCliInstalledVersion?: string | null;
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

  // An on-disk manifest must reference at least one harness installation.
  // The empty-harnesses case used to pass vacuously (the for-loop iterated
  // zero times), letting a truncated `{...harnesses:{}}` file masquerade as
  // valid — and a subsequent uninstall would then iterate zero harnesses,
  // delete the manifest, and report success while leaving every MCP config,
  // agent, hook, and shell export in place.
  const harnesses = m["harnesses"] as Record<string, unknown>;
  if (Object.keys(harnesses).length === 0) return false;
  for (const h of Object.values(harnesses)) {
    if (typeof h !== "object" || h === null) return false;
    const hm = h as Record<string, unknown>;
    if (typeof hm["mcpConfigPath"] !== "string" || typeof hm["defsPath"] !== "string") return false;
    // defsScope is load-bearing (the prev-list inheritance gate branches on
    // it) — an absent/invalid value reads as a permanent scope flip that
    // orphans every recorded file. Refuse-by-name like every other shape.
    if (hm["defsScope"] !== "global" && hm["defsScope"] !== "local") return false;
    if (!Array.isArray(hm["agents"]) || !Array.isArray(hm["commands"])) return false;
    // Element typing: a hand-edited agents: [1,2] otherwise reaches
    // join(dir, file) in uninstall and TypeErrors mid-removal.
    if (!(hm["agents"] as unknown[]).every((x) => typeof x === "string")) return false;
    if (!(hm["commands"] as unknown[]).every((x) => typeof x === "string")) return false;
    if ("skills" in hm) {
      if (!Array.isArray(hm["skills"])) return false;
      if (!(hm["skills"] as unknown[]).every((x) => typeof x === "string")) return false;
    }
    if ("partial" in hm) {
      const p = hm["partial"];
      if (p !== null && p !== "agents" && p !== "commands" && p !== "skills" && p !== "metrics") {
        return false;
      }
    }
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

    if ((hm.skills?.length ?? 0) > 0 && defsExists) {
      const missing = await findMissingFiles(
        hm.defsPath,
        "skills",
        hm.skills ?? [],
      );
      if (missing.length > 0) {
        warnings.push(
          `[${harnessName}] Skill files missing from disk: ${missing.join(", ")}`,
        );
      }
    }
  }

  // Hash verification reads whichever manifest file actually exists. The
  // previous implementation hardcoded the new path, which produced a false
  // "Cannot read manifest file to verify content hash" warning on every
  // uninstall after `loadManifest` migrated a legacy manifest in memory
  // without writing it back to the new location. Silently skip the hash
  // check when no manifest is on disk in either location (in-memory-only
  // manifest, or both locations missing).
  let raw: string | null = null;
  for (const candidate of [getManifestPath(), getLegacyManifestPath()]) {
    try {
      raw = await readFile(candidate, "utf-8");
      break;
    } catch (err) {
      if (!isEnoent(err)) {
        // Warning-only path (hash tamper check) — an unreadable candidate
        // must not masquerade as "no manifest on disk"; name it and skip
        // the hash check rather than silently treating it as absent.
        warnings.push(
          `Cannot read manifest at ${candidate} to verify content hash (${err instanceof Error ? err.message : String(err)})`,
        );
        break;
      }
      // Absent — try next candidate.
    }
  }
  if (raw !== null) {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const { contentHash: storedHash, ...withoutHash } = parsed;
      const canonical = JSON.stringify(withoutHash, null, 2) + "\n";
      const currentHash = fileHash(canonical);
      // Typeof check rather than truthiness — a malformed manifest with
      // `contentHash: 0`, `contentHash: false`, `contentHash: ""`, or no
      // contentHash key at all would all evaluate `storedHash && ...` to
      // false and silently skip tamper detection. Only a missing-key
      // (undefined) manifest is legitimately exempt (legacy / pre-hash);
      // a present-but-not-a-string value is suspect and should warn.
      if (typeof storedHash === "string") {
        if (storedHash !== currentHash) {
          warnings.push(
            "Manifest file has been modified since installation — content hash mismatch",
          );
        }
      } else if (storedHash !== undefined) {
        warnings.push(
          `Manifest contentHash has wrong type (${typeof storedHash}); tamper detection skipped`,
        );
      }
    } catch {
      warnings.push("Manifest file is unparseable JSON");
    }
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
  let raw: string;
  try {
    raw = await readFile(path, "utf-8");
  } catch (err) {
    if (isEnoent(err)) return null; // genuinely absent
    // Unreadable-but-PRESENT must never read as "no manifest": loadManifest's
    // null flows into saveManifest overwriting the file we couldn't read,
    // orphaning every recorded agent/command/hook — and into uninstall's
    // "nothing to uninstall". Same class, same rule as the config readers.
    throw new Error(
      `Could not read the install manifest at ${path} (${err instanceof Error ? err.message : String(err)}) — refusing to continue rather than overwrite the record of what is installed. Nothing was modified.`,
    );
  }
  try {
    return JSON.parse(raw);
  } catch {
    // Malformed is not absent either: proceeding would rewrite the file and
    // orphan everything it recorded. Name the path and the way out.
    throw new Error(
      `The install manifest at ${path} contains invalid JSON — fix or remove it and re-run. (Detected before any UluOps change; nothing was modified. Removing it makes setup treat this as a fresh install; previously installed files will not be tracked for uninstall.)`,
    );
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

  // A PRESENT file that matches no known shape is the last surviving form
  // of "read problem means absent": returning null here lets setup build a
  // fresh manifest and overwrite the record. Refuse by name instead.
  if (newData !== null || legacyData !== null) {
    const path = newData !== null ? getManifestPath() : getLegacyManifestPath();
    throw new Error(
      `The install manifest at ${path} has an unrecognized shape — fix or remove it and re-run. (Detected before any UluOps change; nothing was modified. Removing it makes setup treat this as a fresh install; previously installed files will not be tracked for uninstall.)`,
    );
  }

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

/**
 * Delete the install manifest file from disk. Tries both locations.
 * Returns the paths that could NOT be removed (non-ENOENT failures) so the
 * caller can report the truth instead of an unconditional success —
 * a manifest that survives keeps claiming a full install.
 */
export async function deleteManifest(): Promise<{ failed: string[] }> {
  const failed: string[] = [];
  for (const path of [getManifestPath(), getLegacyManifestPath()]) {
    try {
      await unlink(path);
    } catch (err) {
      if (!isEnoent(err)) {
        failed.push(`${path} (${err instanceof Error ? err.message : String(err)})`);
      }
      // ENOENT — already gone.
    }
  }
  return { failed };
}
