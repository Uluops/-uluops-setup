import { readdir, mkdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import type { HarnessProfile } from "../harnesses/index.js";
import { ASSETS_DIR, findProjectRoot } from "../lib/paths.js";
import { copyIfChanged, unlinkFiles } from "../lib/file-ops.js";

export interface AgentsResult {
  copied: number;
  skipped: number;
  removed: number;
  files: string[];
}

/** Copy pre-rendered agent definitions from harness-specific assets to the target directory. */
export async function installAgents(
  profile: HarnessProfile,
  localDefs: boolean,
  dryRun: boolean,
  existingManifestAgents?: string[],
): Promise<AgentsResult> {
  const srcDir = join(ASSETS_DIR, profile.name, "agents");
  const destDir = localDefs
    ? join(await findProjectRoot(), "uluops", "agents")
    : profile.paths.agentsDir;

  if (!dryRun) {
    await mkdir(destDir, { recursive: true });
  }

  const ext = profile.agentExtension;
  let files: string[];
  try {
    files = (await readdir(srcDir)).filter((f) => f.endsWith(ext));
  } catch {
    return { copied: 0, skipped: 0, removed: 0, files: [] };
  }

  let copied = 0;
  let skipped = 0;

  for (const file of files) {
    const result = await copyIfChanged(
      join(srcDir, file),
      join(destDir, file),
      dryRun,
    );

    if (result === "copied") copied++;
    else skipped++;
  }

  // Remove files that were in the old manifest but no longer in the package
  let removed = 0;
  if (existingManifestAgents) {
    for (const oldFile of existingManifestAgents) {
      if (!files.includes(oldFile)) {
        if (!dryRun) {
          try {
            await unlink(join(destDir, oldFile));
          } catch {
            // Already gone
          }
        }
        removed++;
      }
    }
  }

  return { copied, skipped, removed, files };
}

/** Remove previously installed agent files by name. */
export async function uninstallAgents(
  files: string[],
  defsPath: string,
): Promise<number> {
  return unlinkFiles(join(defsPath, "agents"), files);
}
