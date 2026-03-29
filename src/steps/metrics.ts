/**
 * Metrics Step
 *
 * Installs agent-metrics tool files to ~/.claude/tools/agent-metrics/
 * and configures the SubagentStop hook in settings.json for auto-capture.
 */

import { mkdir, readdir, copyFile, rm, access } from "node:fs/promises";
import { join } from "node:path";
import { getClaudeHome } from "../lib/paths.js";
import {
  readSettings,
  writeSettings,
  mergeUluopsHook,
  removeUluopsHook,
} from "../lib/settings-merger.js";

/** Where agent-metrics dist files are installed */
export function getMetricsToolDir(): string {
  return join(getClaudeHome(), "tools", "agent-metrics");
}

/** Path to Claude Code's settings.json */
export function getSettingsPath(): string {
  return join(getClaudeHome(), "settings.json");
}

/** The hook command that runs on SubagentStop */
function getHookCommand(): string {
  const toolDir = getMetricsToolDir();
  return `node ${join(toolDir, "dist", "hook.js")}`;
}

export interface MetricsResult {
  toolFilesCopied: number;
  hookConfigured: boolean;
}

/**
 * Find the agent-metrics package source directory.
 * Looks for it as a sibling package in the monorepo or as an npm dependency.
 */
async function findMetricsSource(): Promise<string | null> {
  // Try to find the package via Node.js module resolution
  try {
    const resolved = import.meta.resolve("@uluops/agent-metrics");
    // resolved is like file:///path/to/dist/index.js — get the package root
    const distDir = new URL(".", resolved).pathname;
    const pkgRoot = join(distDir, "..");
    return pkgRoot;
  } catch {
    // Not installed as dependency
  }

  return null;
}

/**
 * Copy agent-metrics dist files to the tool directory.
 * Copies all .js files needed for the hook and CLI.
 */
async function copyToolFiles(
  srcRoot: string,
  destRoot: string,
  dryRun: boolean,
): Promise<number> {
  const srcDist = join(srcRoot, "dist");
  const destDist = join(destRoot, "dist");

  if (!dryRun) {
    await mkdir(destDist, { recursive: true });
    await mkdir(join(destDist, "commands"), { recursive: true });
    await mkdir(join(destDist, "display"), { recursive: true });
  }

  let filesCopied = 0;

  // Copy top-level dist files
  const topFiles = await readdir(srcDist);
  for (const file of topFiles) {
    if (!file.endsWith(".js")) continue;
    if (file.includes(".test.")) continue;
    if (file === "test-utils.js") continue;
    if (!dryRun) {
      await copyFile(join(srcDist, file), join(destDist, file));
    }
    filesCopied++;
  }

  // Copy commands/ subdirectory
  try {
    const cmdFiles = await readdir(join(srcDist, "commands"));
    for (const file of cmdFiles) {
      if (!file.endsWith(".js")) continue;
      if (file.includes(".test.")) continue;
      if (!dryRun) {
        await copyFile(
          join(srcDist, "commands", file),
          join(destDist, "commands", file),
        );
      }
      filesCopied++;
    }
  } catch {
    // commands/ doesn't exist — not critical
  }

  // Copy display/ subdirectory
  try {
    const dispFiles = await readdir(join(srcDist, "display"));
    for (const file of dispFiles) {
      if (!file.endsWith(".js")) continue;
      if (file.includes(".test.")) continue;
      if (!dryRun) {
        await copyFile(
          join(srcDist, "display", file),
          join(destDist, "display", file),
        );
      }
      filesCopied++;
    }
  } catch {
    // display/ doesn't exist — not critical
  }

  // Copy package.json (needed for CLI bin resolution)
  try {
    if (!dryRun) {
      await copyFile(join(srcRoot, "package.json"), join(destRoot, "package.json"));
    }
    filesCopied++;
  } catch {
    // Not critical
  }

  return filesCopied;
}

/**
 * Install agent-metrics: copy tool files and configure SubagentStop hook.
 */
export async function installMetrics(
  dryRun: boolean,
): Promise<MetricsResult> {
  const toolDir = getMetricsToolDir();
  const settingsPath = getSettingsPath();

  // Find source package
  const srcRoot = await findMetricsSource();

  let toolFilesCopied = 0;
  if (srcRoot) {
    // Copy tool files
    if (!dryRun) {
      await mkdir(toolDir, { recursive: true });
    }
    toolFilesCopied = await copyToolFiles(srcRoot, toolDir, dryRun);
  } else {
    // Check if already installed (from previous run or install.sh)
    try {
      await access(join(toolDir, "dist", "hook.js"));
    } catch {
      // Not found anywhere — skip tool installation, just configure hook
      // if files happen to exist
    }
  }

  // Configure hook in settings.json
  let hookConfigured = false;
  if (!dryRun) {
    const settings = await readSettings(settingsPath);
    const hookCommand = getHookCommand();
    const merged = mergeUluopsHook(settings, hookCommand);
    await writeSettings(settingsPath, merged);
    hookConfigured = true;
  } else {
    hookConfigured = true;
  }

  return { toolFilesCopied, hookConfigured };
}

/**
 * Uninstall agent-metrics: remove hook from settings and optionally remove tool files.
 */
export async function uninstallMetrics(dryRun: boolean): Promise<void> {
  const settingsPath = getSettingsPath();
  const toolDir = getMetricsToolDir();

  // Remove hook from settings.json
  if (!dryRun) {
    const settings = await readSettings(settingsPath);
    const cleaned = removeUluopsHook(settings);
    await writeSettings(settingsPath, cleaned);
  }

  // Remove tool directory
  if (!dryRun) {
    try {
      await rm(toolDir, { recursive: true, force: true });
    } catch {
      // Already gone
    }
  }
}
