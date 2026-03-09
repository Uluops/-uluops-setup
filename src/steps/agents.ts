import { join } from "node:path";
import { ASSETS_DIR, getAgentsDir } from "../lib/paths.js";
import { syncAssets, unlinkFiles } from "../lib/file-ops.js";

export interface AgentsResult {
  copied: number;
  skipped: number;
  removed: number;
  files: string[];
}

export async function installAgents(
  localDefs: boolean,
  dryRun: boolean,
  existingManifestAgents?: string[],
): Promise<AgentsResult> {
  return syncAssets({
    srcDir: join(ASSETS_DIR, "agents"),
    destDir: getAgentsDir(localDefs),
    dryRun,
    oldManifestFiles: existingManifestAgents,
  });
}

export async function uninstallAgents(
  files: string[],
  defsPath: string,
): Promise<number> {
  return unlinkFiles(join(defsPath, "agents"), files);
}
