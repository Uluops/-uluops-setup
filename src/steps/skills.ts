import { mkdir, readdir, rmdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { HarnessProfile } from "../harnesses/index.js";
import { ASSETS_DIR, findProjectRoot } from "../lib/paths.js";
import { copyIfChanged, removeStaleFiles, unlinkFiles, isEnoent } from "../lib/file-ops.js";

export interface SkillsResult {
  copied: number;
  skipped: number;
  removed: number;
  files: string[];
  skippedReason?: string;
  failures: { file: string; error: string }[];
}

async function listFilesRecursive(dir: string, prefix = ""): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (err) {
    // ENOENT = no skills shipped/installed at this level. Anything else
    // throws — an empty list here becomes the manifest's authoritative
    // skills record.
    if (!isEnoent(err)) throw err;
    return [];
  }

  const files: string[] = [];
  for (const entry of entries) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFilesRecursive(full, rel));
    } else if (entry.isFile()) {
      files.push(rel);
    }
  }
  return files.sort((a, b) => a.localeCompare(b));
}

/**
 * Install the harness's skill files from the bundled assets: unchanged files
 * are skipped (hash comparison), updated files overwritten, and manifest
 * entries no longer in the assets removed. `localDefs` redirects the install
 * to `./uluops/skills` (project-scoped). Per-file failures are collected in
 * the result, not thrown.
 */
export async function installSkills(
  profile: HarnessProfile,
  localDefs: boolean,
  dryRun: boolean,
  existingManifestSkills?: string[],
): Promise<SkillsResult> {
  const srcBase = join(ASSETS_DIR, profile.name, "skills");
  const destBase = localDefs
    ? join(await findProjectRoot(), "uluops", "skills")
    : profile.paths.skillsDir;

  if (!destBase) {
    return {
      copied: 0,
      skipped: 0,
      removed: 0,
      files: [],
      skippedReason: "not-supported",
      failures: [],
    };
  }

  const files = await listFilesRecursive(srcBase);
  if (files.length === 0) {
    return {
      copied: 0,
      skipped: 0,
      removed: 0,
      files: [],
      skippedReason: "not-supported",
      failures: [],
    };
  }

  let copied = 0;
  let skipped = 0;
  const installedFiles: string[] = [];
  const failures: SkillsResult["failures"] = [];

  for (const file of files) {
    const src = join(srcBase, file);
    const dest = join(destBase, file);
    try {
      if (!dryRun) {
        await mkdir(dirname(dest), { recursive: true });
      }
      const result = await copyIfChanged(src, dest, dryRun);
      if (result === "copied") copied++;
      else skipped++;
      installedFiles.push(file);
    } catch (err) {
      failures.push({
        file,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // See agents.ts: stale = no-longer-shipped, reconciled against SOURCE.
  const removed = await removeStaleFiles(
    destBase,
    existingManifestSkills,
    files,
    dryRun,
  );

  const recordedSkillFiles = [
    ...installedFiles,
    ...failures
      .map((f) => f.file)
      .filter((f) => existingManifestSkills?.includes(f) ?? false),
  ];
  return { copied, skipped, removed, files: recordedSkillFiles, failures };
}

/**
 * Remove the manifest-listed skill files under `defsPath/skills`, then prune
 * any directories left empty. Returns the number of files removed.
 */
export async function uninstallSkills(
  files: string[],
  defsPath: string,
): Promise<number> {
  const skillsDir = join(defsPath, "skills");
  const removed = await unlinkFiles(skillsDir, files);
  const skillDirs = new Set(
    files
      .map((file) => file.split("/")[0])
      .filter((dir): dir is string => typeof dir === "string" && dir.length > 0),
  );
  for (const dir of skillDirs) {
    try {
      await rmdir(join(skillsDir, dir));
    } catch (err) {
      const code = (err as NodeJS.ErrnoException)?.code;
      if (code !== "ENOENT" && code !== "ENOTEMPTY") {
        // ENOENT (already gone) and ENOTEMPTY (user files present) are the
        // expected outcomes; anything else is a real cleanup failure.
        console.warn(
          `  ⚠ Could not remove skill dir ${join(skillsDir, dir)}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }
  return removed;
}
