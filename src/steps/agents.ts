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
  /**
   * Per-file copy failures. The loop continues past errors so a single bad
   * file (EACCES, ENOSPC, ENAMETOOLONG) cannot abort the whole install and
   * leave the destination half-populated. The caller surfaces these via
   * `warn()` and a re-run will pick up the failed files. Files in this list
   * are NOT counted in `copied` (or `skipped`).
   */
  failures: { file: string; error: string }[];
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
    return { copied: 0, skipped: 0, removed: 0, files: [], failures: [] };
  }

  let copied = 0;
  let skipped = 0;
  const failures: AgentsResult["failures"] = [];

  for (const file of files) {
    try {
      const result = await copyIfChanged(
        join(srcDir, file),
        join(destDir, file),
        dryRun,
      );
      if (result === "copied") copied++;
      else skipped++;
    } catch (err) {
      // Continue past per-file failures so one bad file (EACCES, ENOSPC,
      // ENAMETOOLONG) does not abort the whole install and leave the
      // destination half-populated. The caller `warn()`s these and a re-run
      // will retry — setup is idempotent on success.
      failures.push({
        file,
        error: err instanceof Error ? err.message : String(err),
      });
    }
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

  return { copied, skipped, removed, files, failures };
}

/** Remove previously installed agent files by name. */
export async function uninstallAgents(
  files: string[],
  defsPath: string,
): Promise<number> {
  return unlinkFiles(join(defsPath, "agents"), files);
}
