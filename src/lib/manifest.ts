import { readFile, writeFile, unlink, access } from "node:fs/promises";
import { join } from "node:path";
import { getManifestPath } from "./paths.js";
import { fileHash } from "./hash.js";

export interface Manifest {
  version: string;
  installedAt: string;
  mcpScope: "global" | "local";
  mcpConfigPath: string;
  defsScope: "global" | "local";
  defsPath: string;
  shellModified: boolean;
  agents: string[];
  commands: string[];
  /** Whether agent-metrics hook is configured */
  metricsHookInstalled?: boolean;
  /** SHA-256 content hash of the manifest at save time */
  contentHash?: string;
}

function isManifest(obj: unknown): obj is Manifest {
  if (typeof obj !== "object" || obj === null) return false;
  const m = obj as Record<string, unknown>;
  return (
    typeof m["version"] === "string" &&
    typeof m["installedAt"] === "string" &&
    typeof m["mcpConfigPath"] === "string" &&
    typeof m["defsPath"] === "string" &&
    Array.isArray(m["agents"]) &&
    Array.isArray(m["commands"])
  );
}

export interface ManifestValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/** Validate a manifest against the current filesystem state. Checks that referenced paths exist and the content hash is intact. */
export async function validateManifest(manifest: Manifest): Promise<ManifestValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  const mcpExists = await pathExists(manifest.mcpConfigPath);
  if (!mcpExists) {
    errors.push(`MCP config path does not exist: ${manifest.mcpConfigPath}`);
  }

  const defsExists = await pathExists(manifest.defsPath);
  if (!defsExists) {
    errors.push(`Defs path does not exist: ${manifest.defsPath}`);
  }

  if (manifest.agents.length > 0 && defsExists) {
    const missingAgents = await findMissingFiles(manifest.defsPath, "agents", manifest.agents);
    if (missingAgents.length > 0) {
      warnings.push(`Agent files listed in manifest but not on disk: ${missingAgents.join(", ")}`);
    }
  }

  if (manifest.commands.length > 0 && defsExists) {
    const missingCommands = await findMissingFiles(manifest.defsPath, "commands", manifest.commands);
    if (missingCommands.length > 0) {
      warnings.push(`Command files listed in manifest but not on disk: ${missingCommands.join(", ")}`);
    }
  }

  const manifestPath = getManifestPath();
  try {
    const raw = await readFile(manifestPath, "utf-8");
    const currentHash = fileHash(raw);
    if (manifest.contentHash && manifest.contentHash !== currentHash) {
      warnings.push("Manifest file has been modified since installation — content hash mismatch");
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

async function findMissingFiles(baseDir: string, subDir: string, files: string[]): Promise<string[]> {
  const missing: string[] = [];
  for (const file of files) {
    if (!(await pathExists(join(baseDir, subDir, file)))) {
      missing.push(file);
    }
  }
  return missing;
}

/** Load the install manifest from disk, or return null if it doesn't exist or fails validation. */
export async function loadManifest(): Promise<Manifest | null> {
  try {
    const raw = await readFile(getManifestPath(), "utf-8");
    const parsed: unknown = JSON.parse(raw);
    return isManifest(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Save the install manifest to disk, embedding a content hash for tamper detection. */
export async function saveManifest(manifest: Manifest): Promise<void> {
  const raw = JSON.stringify(manifest, null, 2) + "\n";
  manifest.contentHash = fileHash(raw);
  await writeFile(getManifestPath(), JSON.stringify(manifest, null, 2) + "\n");
}

/** Delete the install manifest file from disk. Silently succeeds if already absent. */
export async function deleteManifest(): Promise<void> {
  try {
    await unlink(getManifestPath());
  } catch {
    // Already gone
  }
}
