import { readFile, readdir, mkdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import type { HarnessProfile } from "../harnesses/index.js";
import { ASSETS_DIR, findProjectRoot } from "../lib/paths.js";
import { copyIfChanged, writeIfChanged, unlinkFiles } from "../lib/file-ops.js";
import { transformAgent } from "../lib/agent-transform.js";

export interface AgentsResult {
  copied: number;
  skipped: number;
  removed: number;
  files: string[];
}

/** Source directory for agent assets (single set, Claude Code format). */
const AGENTS_SRC = join(ASSETS_DIR, "agents");

/** Copy agent definition files from assets to the harness agents directory,
 *  transforming frontmatter to match the target harness format. */
export async function installAgents(
  profile: HarnessProfile,
  localDefs: boolean,
  dryRun: boolean,
  existingManifestAgents?: string[],
): Promise<AgentsResult> {
  const destDir = localDefs
    ? join(await findProjectRoot(), "uluops", "agents")
    : profile.paths.agentsDir;

  if (!dryRun) {
    await mkdir(destDir, { recursive: true });
  }

  const needsTransform = profile.name !== "claude-code";

  let files: string[];
  try {
    files = (await readdir(AGENTS_SRC)).filter((f) => f.endsWith(".md"));
  } catch {
    return { copied: 0, skipped: 0, removed: 0, files: [] };
  }

  let copied = 0;
  let skipped = 0;

  for (const file of files) {
    let result: "copied" | "skipped";

    if (needsTransform) {
      const markdown = await readFile(join(AGENTS_SRC, file), "utf-8");
      const transformed = transformAgent(markdown, profile.name);
      result = await writeIfChanged(join(destDir, file), transformed, dryRun);
    } else {
      result = await copyIfChanged(
        join(AGENTS_SRC, file),
        join(destDir, file),
        dryRun,
      );
    }

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
