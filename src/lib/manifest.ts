import { readFile, writeFile } from "node:fs/promises";
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

export async function loadManifest(): Promise<Manifest | null> {
  try {
    const raw = await readFile(getManifestPath(), "utf-8");
    return JSON.parse(raw) as Manifest;
  } catch {
    return null;
  }
}

export async function saveManifest(manifest: Manifest): Promise<void> {
  await writeFile(getManifestPath(), JSON.stringify(manifest, null, 2) + "\n");
}

export async function deleteManifest(): Promise<void> {
  const { unlink } = await import("node:fs/promises");
  try {
    await unlink(getManifestPath());
  } catch {
    // Already gone
  }
}
