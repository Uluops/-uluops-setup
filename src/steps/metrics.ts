/**
 * Metrics Step
 *
 * Installs agent-metrics tool files and configures post-agent hooks.
 * Only active for harnesses that support hooks (currently Claude Code only).
 */

import { mkdir, readdir, copyFile, rm, access } from "node:fs/promises";
import { join } from "node:path";
import type { HarnessProfile } from "../harnesses/index.js";

/** Where agent-metrics dist files are installed (derived from profile) */
function getMetricsToolDir(profile: HarnessProfile): string | null {
  return profile.paths.toolsDir;
}

/**
 * The hook command that runs on SubagentStop.
 * @internal Exported for testing only — not part of the public API.
 */
export function getHookCommand(profile: HarnessProfile): string {
  const toolDir = getMetricsToolDir(profile);
  if (!toolDir) throw new Error("No tool dir for this harness");
  const nodePath = process.execPath;
  const hookPath = join(toolDir, "dist", "hook.js");
  if (nodePath.includes('"') || hookPath.includes('"')) {
    throw new Error("Hook command paths must not contain double-quote characters");
  }
  return `"${nodePath}" "${hookPath}"`;
}

export interface MetricsResult {
  toolFilesCopied: number;
  hookConfigured: boolean;
  skippedReason?: string;
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

/** Copy .js files from a source dir to a dest dir, skipping test files. */
async function copyJsDir(
  srcDir: string,
  destDir: string,
  dryRun: boolean,
): Promise<number> {
  let count = 0;
  try {
    const files = await readdir(srcDir);
    for (const file of files) {
      if (!file.endsWith(".js") || file.includes(".test.") || file === "test-utils.js") continue;
      if (!dryRun) await copyFile(join(srcDir, file), join(destDir, file));
      count++;
    }
  } catch {
    // Directory doesn't exist — not critical
  }
  return count;
}

async function copyToolFiles(
  srcRoot: string,
  destRoot: string,
  dryRun: boolean,
): Promise<number> {
  const srcDist = join(srcRoot, "dist");
  const destDist = join(destRoot, "dist");
  const subDirs = ["commands", "display"];

  if (!dryRun) {
    await mkdir(destDist, { recursive: true });
    for (const sub of subDirs) {
      await mkdir(join(destDist, sub), { recursive: true });
    }
  }

  let filesCopied = await copyJsDir(srcDist, destDist, dryRun);
  for (const sub of subDirs) {
    filesCopied += await copyJsDir(join(srcDist, sub), join(destDist, sub), dryRun);
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
 * Install agent-metrics: copy tool files and configure hook.
 * Skips entirely if the harness doesn't support hooks.
 */
export async function installMetrics(
  profile: HarnessProfile,
  dryRun: boolean,
): Promise<MetricsResult> {
  if (!profile.hooks || !profile.paths.toolsDir || !profile.paths.settingsPath) {
    return { toolFilesCopied: 0, hookConfigured: false, skippedReason: "no-hook-support" };
  }

  const toolDir = profile.paths.toolsDir;
  const settingsPath = profile.paths.settingsPath;

  const srcRoot = await findMetricsSource();

  let toolFilesCopied = 0;
  if (srcRoot) {
    if (!dryRun) {
      await mkdir(toolDir, { recursive: true });
    }
    toolFilesCopied = await copyToolFiles(srcRoot, toolDir, dryRun);
  } else {
    try {
      await access(join(toolDir, "dist", "hook.js"));
    } catch {
      // Not found anywhere
    }
  }

  let hookConfigured = false;
  const hookJsPath = join(toolDir, "dist", "hook.js");
  const hookJsExists = await access(hookJsPath).then(
    () => true,
    () => false,
  );
  if (hookJsExists && !dryRun) {
    const hookCommand = getHookCommand(profile);
    await profile.hooks.install(settingsPath, hookCommand, false);
    hookConfigured = true;
  } else if (hookJsExists && dryRun) {
    hookConfigured = true;
  }

  return { toolFilesCopied, hookConfigured };
}

/**
 * Uninstall agent-metrics: remove hook and tool files.
 */
export async function uninstallMetrics(
  profile: HarnessProfile,
  dryRun: boolean,
): Promise<void> {
  if (!profile.hooks || !profile.paths.toolsDir || !profile.paths.settingsPath) {
    return;
  }

  if (!dryRun) {
    await profile.hooks.remove(profile.paths.settingsPath, false);
  }

  if (!dryRun) {
    try {
      await rm(profile.paths.toolsDir, { recursive: true, force: true });
    } catch {
      // Already gone
    }
  }
}
