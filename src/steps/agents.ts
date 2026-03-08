import { readdir, readFile, writeFile, mkdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { ASSETS_DIR, getAgentsDir } from "../lib/paths.js";

export interface AgentsResult {
  copied: number;
  skipped: number;
  removed: number;
  files: string[];
}

function fileHash(content: string): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 12);
}

export async function installAgents(
  localDefs: boolean,
  dryRun: boolean,
  existingManifestAgents?: string[],
): Promise<AgentsResult> {
  const srcDir = join(ASSETS_DIR, "agents");
  const destDir = getAgentsDir(localDefs);

  if (!dryRun) {
    await mkdir(destDir, { recursive: true });
  }

  const assetFiles = await readdir(srcDir);
  const mdFiles = assetFiles.filter((f) => f.endsWith(".md"));

  let copied = 0;
  let skipped = 0;

  for (const file of mdFiles) {
    const srcContent = await readFile(join(srcDir, file), "utf-8");
    const destPath = join(destDir, file);

    // Check if destination already has identical content
    try {
      const destContent = await readFile(destPath, "utf-8");
      if (fileHash(srcContent) === fileHash(destContent)) {
        skipped++;
        continue;
      }
    } catch {
      // File doesn't exist yet
    }

    if (!dryRun) {
      await writeFile(destPath, srcContent);
    }
    copied++;
  }

  // Remove files that were in the old manifest but no longer in the package
  let removed = 0;
  if (existingManifestAgents) {
    for (const oldFile of existingManifestAgents) {
      if (!mdFiles.includes(oldFile)) {
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

  return { copied, skipped, removed, files: mdFiles };
}

export async function uninstallAgents(
  files: string[],
  defsPath: string,
): Promise<number> {
  let removed = 0;
  const agentsDir = join(defsPath, "agents");

  for (const file of files) {
    try {
      await unlink(join(agentsDir, file));
      removed++;
    } catch {
      // Already gone
    }
  }
  return removed;
}
