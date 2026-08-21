import { readdir, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { HarnessProfile } from "../harnesses/index.js";
import { ASSETS_DIR, findProjectRoot } from "../lib/paths.js";
import {
  copyIfChanged,
  unlinkFiles,
  removeStaleFiles,
  isEnoent,
} from "../lib/file-ops.js";

export interface CommandsResult {
  agentCommands: number;
  workflowCommands: number;
  pipelineCommands: number;
  skipped: number;
  removed: number;
  files: string[];
  skippedReason?: string;
  /**
   * Per-file copy failures across all subdirs. The loop continues past errors
   * so a single bad file cannot abort the install and leave commands half-
   * installed. The caller surfaces these via `warn()`. Files in this list are
   * NOT counted in agent/workflow/pipeline counters (or `skipped`).
   */
  failures: { file: string; error: string }[];
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
  } catch (err) {
    // Only genuine absence means "this harness ships no commands" — an
    // EACCES here previously rendered as the 'coming soon' capability
    // message while wiping the manifest's commands list.
    if (!isEnoent(err)) throw err;
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
      failures: [],
    };
  }

  let agentCommands = 0;
  let workflowCommands = 0;
  let pipelineCommands = 0;
  let skipped = 0;
  const allFiles: string[] = [];
  const sourceFiles: string[] = [];
  const failures: CommandsResult["failures"] = [];

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
    } catch (err) {
      if (!isEnoent(err)) throw err; // see the srcBase probe above
      continue;
    }

    for (const file of files) {
      const relativePath = `${subdir}/${file}`;
      try {
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
      } catch (err) {
        // Continue past per-file failures (see AgentsResult.failures rationale).
        failures.push({
          file: relativePath,
          error: err instanceof Error ? err.message : String(err),
        });
      } finally {
        // Source census regardless of copy outcome — stale reconciliation
        // must compare against what the package SHIPS, or a failed copy
        // reads as "no longer shipped" and the prior working file is
        // deleted (the ENOSPC-wipes-everything shape).
        sourceFiles.push(relativePath);
      }
    }
  }

  const removed = await removeStaleFiles(
    destBase,
    existingManifestCommands,
    sourceFiles,
    dryRun,
  );

  // Record keeps failed-but-previously-installed files (prior copy is still
  // on disk after source-based reconciliation) so uninstall can remove them.
  const recordedCommandFiles = [
    ...allFiles,
    ...failures
      .map((f) => f.file)
      .filter((f) => existingManifestCommands?.includes(f) ?? false),
  ];

  return {
    agentCommands,
    workflowCommands,
    pipelineCommands,
    skipped,
    removed,
    files: recordedCommandFiles,
    failures,
  };
}

/** Remove previously installed command files by relative path. Returns count of successfully removed files. */
export async function uninstallCommands(
  files: string[],
  defsPath: string,
): Promise<number> {
  return unlinkFiles(join(defsPath, "commands"), files);
}
