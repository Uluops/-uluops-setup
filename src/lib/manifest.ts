import { readFile, writeFile, unlink } from "node:fs/promises";
import { getManifestPath } from "./paths.js";

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

export async function loadManifest(): Promise<Manifest | null> {
  try {
    const raw = await readFile(getManifestPath(), "utf-8");
    const parsed: unknown = JSON.parse(raw);
    return isManifest(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function saveManifest(manifest: Manifest): Promise<void> {
  await writeFile(getManifestPath(), JSON.stringify(manifest, null, 2) + "\n");
}

export async function deleteManifest(): Promise<void> {
  try {
    await unlink(getManifestPath());
  } catch {
    // Already gone
  }
}
