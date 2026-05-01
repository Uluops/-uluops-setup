import { join } from "node:path";
import { ASSETS_DIR, getAgentsDir } from "../lib/paths.js";
import { syncAssets, unlinkFiles } from "../lib/file-ops.js";

export interface AgentsResult {
  copied: number;
  skipped: number;
  removed: number;
  files: string[];
}

/** Copy agent .md files from assets to the Claude agents directory, using hash comparison to skip unchanged files. */
export async function installAgents(
  localDefs: boolean,
  dryRun: boolean,
  existingManifestAgents?: string[],
): Promise<AgentsResult> {
  return syncAssets({
    srcDir: join(ASSETS_DIR, "agents"),
    destDir: await getAgentsDir(localDefs),
    dryRun,
    oldManifestFiles: existingManifestAgents,
  });
}

/** Remove previously installed agent files by name. Returns count of successfully removed files. */
export async function uninstallAgents(
  files: string[],
  defsPath: string,
): Promise<number> {
  return unlinkFiles(join(defsPath, "agents"), files);
}
