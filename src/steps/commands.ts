import { readdir, mkdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import { ASSETS_DIR, getCommandsDir } from "../lib/paths.js";
import { copyIfChanged } from "../lib/file-ops.js";

export interface CommandsResult {
  agentCommands: number;
  workflowCommands: number;
  skipped: number;
  removed: number;
  files: string[];
}

const SUBDIRS = ["agents", "workflows"] as const;

export async function installCommands(
  localDefs: boolean,
  dryRun: boolean,
  existingManifestCommands?: string[],
): Promise<CommandsResult> {
  const srcBase = join(ASSETS_DIR, "commands");
  const destBase = getCommandsDir(localDefs);

  let agentCommands = 0;
  let workflowCommands = 0;
  let skipped = 0;
  const allFiles: string[] = [];

  for (const subdir of SUBDIRS) {
    const srcDir = join(srcBase, subdir);
    const destDir = join(destBase, subdir);

    if (!dryRun) {
      await mkdir(destDir, { recursive: true });
    }

    let files: string[];
    try {
      files = (await readdir(srcDir)).filter((f) => f.endsWith(".md"));
    } catch {
      continue;
    }

    for (const file of files) {
      const relativePath = `${subdir}/${file}`;
      const result = await copyIfChanged(
        join(srcDir, file),
        join(destDir, file),
        dryRun,
      );

      if (result === "copied") {
        if (subdir === "agents") agentCommands++;
        else workflowCommands++;
      } else {
        skipped++;
      }

      allFiles.push(relativePath);
    }
  }

  // Remove files that were in the old manifest but no longer in the package
  let removed = 0;
  if (existingManifestCommands) {
    for (const oldFile of existingManifestCommands) {
      if (!allFiles.includes(oldFile)) {
        if (!dryRun) {
          try {
            await unlink(join(destBase, oldFile));
          } catch {
            // Already gone
          }
        }
        removed++;
      }
    }
  }

  return {
    agentCommands,
    workflowCommands,
    skipped,
    removed,
    files: allFiles,
  };
}

export async function uninstallCommands(
  files: string[],
  defsPath: string,
): Promise<number> {
  const { unlinkFiles } = await import("../lib/file-ops.js");
  return unlinkFiles(join(defsPath, "commands"), files);
}
