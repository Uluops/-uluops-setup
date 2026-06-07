import { mkdir, readdir, rmdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { HarnessProfile } from "../harnesses/index.js";
import { ASSETS_DIR, findProjectRoot } from "../lib/paths.js";
import { copyIfChanged, removeStaleFiles, unlinkFiles } from "../lib/file-ops.js";

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
  } catch {
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

  const removed = await removeStaleFiles(
    destBase,
    existingManifestSkills,
    installedFiles,
    dryRun,
  );

  return { copied, skipped, removed, files: installedFiles, failures };
}

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
    } catch {
      // Already gone or non-empty due to user files.
    }
  }
  return removed;
}
