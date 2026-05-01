import { join } from "node:path";
import type { HarnessProfile } from "../harnesses/index.js";
import { ASSETS_DIR, findProjectRoot } from "../lib/paths.js";
import { syncAssets, unlinkFiles } from "../lib/file-ops.js";

export interface AgentsResult {
  copied: number;
  skipped: number;
  removed: number;
  files: string[];
}

/** Copy agent definition files from assets to the harness agents directory. */
export async function installAgents(
  profile: HarnessProfile,
  localDefs: boolean,
  dryRun: boolean,
  existingManifestAgents?: string[],
): Promise<AgentsResult> {
  const destDir = localDefs
    ? join(await findProjectRoot(), "uluops", "agents")
    : profile.paths.agentsDir;

  return syncAssets({
    srcDir: join(ASSETS_DIR, "agents", profile.name),
    destDir,
    dryRun,
    extension: profile.agentExtension,
    oldManifestFiles: existingManifestAgents,
  });
}

/** Remove previously installed agent files by name. */
export async function uninstallAgents(
  files: string[],
  defsPath: string,
): Promise<number> {
  return unlinkFiles(join(defsPath, "agents"), files);
}
