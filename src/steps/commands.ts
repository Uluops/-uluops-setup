import { readdir, readFile, writeFile, mkdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { ASSETS_DIR, getCommandsDir } from "../lib/paths.js";

export interface CommandsResult {
  agentCommands: number;
  workflowCommands: number;
  skipped: number;
  removed: number;
  files: string[];
}

function fileHash(content: string): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 12);
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
      const srcContent = await readFile(join(srcDir, file), "utf-8");
      const destPath = join(destDir, file);
      const relativePath = `${subdir}/${file}`;

      // Check if destination already has identical content
      try {
        const destContent = await readFile(destPath, "utf-8");
        if (fileHash(srcContent) === fileHash(destContent)) {
          skipped++;
          allFiles.push(relativePath);
          continue;
        }
      } catch {
        // File doesn't exist yet
      }

      if (!dryRun) {
        await writeFile(destPath, srcContent);
      }

      if (subdir === "agents") agentCommands++;
      else workflowCommands++;

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
  let removed = 0;
  const commandsDir = join(defsPath, "commands");

  for (const file of files) {
    try {
      await unlink(join(commandsDir, file));
      removed++;
    } catch {
      // Already gone
    }
  }
  return removed;
}
