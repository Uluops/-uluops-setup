import { readdir, mkdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import type { HarnessProfile } from "../harnesses/index.js";
import { ASSETS_DIR, findProjectRoot } from "../lib/paths.js";
import { copyIfChanged } from "../lib/file-ops.js";

export interface CommandsResult {
  agentCommands: number;
  workflowCommands: number;
  pipelineCommands: number;
  skipped: number;
  removed: number;
  files: string[];
  skippedReason?: string;
}

const SUBDIRS = ["agents", "workflows", "pipelines"] as const;

/** Install pre-rendered command files from harness-specific assets. */
export async function installCommands(
  profile: HarnessProfile,
  localDefs: boolean,
  dryRun: boolean,
  existingManifestCommands?: string[],
): Promise<CommandsResult> {
  const srcBase = join(ASSETS_DIR, profile.name, "commands");
  const destBase = localDefs
    ? join(await findProjectRoot(), "uluops", "commands")
    : profile.paths.commandsDir;

  // If no commands directory exists for this harness, skip gracefully
  let hasSrcDir: boolean;
  try {
    await readdir(srcBase);
    hasSrcDir = true;
  } catch {
    hasSrcDir = false;
  }

  if (!hasSrcDir) {
    return {
      agentCommands: 0,
      workflowCommands: 0,
      pipelineCommands: 0,
      skipped: 0,
      removed: 0,
      files: [],
      skippedReason: "not-supported",
    };
  }

  let agentCommands = 0;
  let workflowCommands = 0;
  let pipelineCommands = 0;
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
      files = (await readdir(srcDir)).filter(
        (f) => f.endsWith(".md") || f.endsWith(".toml"),
      );
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
        else if (subdir === "workflows") workflowCommands++;
        else pipelineCommands++;
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
    pipelineCommands,
    skipped,
    removed,
    files: allFiles,
  };
}

/** Remove previously installed command files by relative path. Returns count of successfully removed files. */
export async function uninstallCommands(
  files: string[],
  defsPath: string,
): Promise<number> {
  const { unlinkFiles } = await import("../lib/file-ops.js");
  return unlinkFiles(join(defsPath, "commands"), files);
}
