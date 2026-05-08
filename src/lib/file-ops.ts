import { readFile, writeFile, mkdir, unlink, access, copyFile, readdir } from "node:fs/promises";
import { join, basename } from "node:path";
import { fileHash } from "./hash.js";

/**
 * Copy a file if its content has changed (hash comparison). Returns "copied" or "skipped".
 */
export async function copyIfChanged(
  srcPath: string,
  destPath: string,
  dryRun: boolean,
): Promise<"copied" | "skipped"> {
  const srcContent = await readFile(srcPath, "utf-8");
  const srcHash = fileHash(srcContent);

  try {
    const destContent = await readFile(destPath, "utf-8");
    if (srcHash === fileHash(destContent)) {
      return "skipped";
    }
  } catch {
    // File doesn't exist yet
  }

  if (!dryRun) {
    await writeFile(destPath, srcContent);
  }
  return "copied";
}

/**
 * Write content to a file if it differs from the current content (hash comparison).
 * Returns "copied" or "skipped".
 */
export async function writeIfChanged(
  destPath: string,
  content: string,
  dryRun: boolean,
): Promise<"copied" | "skipped"> {
  const newHash = fileHash(content);

  try {
    const existing = await readFile(destPath, "utf-8");
    if (newHash === fileHash(existing)) {
      return "skipped";
    }
  } catch {
    // File doesn't exist yet
  }

  if (!dryRun) {
    await writeFile(destPath, content);
  }
  return "copied";
}

/**
 * Remove files from a directory. Returns count of successfully removed files.
 */
export async function unlinkFiles(
  dir: string,
  files: string[],
): Promise<number> {
  let removed = 0;
  for (const file of files) {
    try {
      await unlink(join(dir, file));
      removed++;
    } catch {
      // Already gone
    }
  }
  return removed;
}

/**
 * Ensure a directory exists, then copy matching .md files using hash comparison.
 * Returns list of copied files, skipped count, and removed count (for old manifest entries).
 */
export async function syncAssets(opts: {
  srcDir: string;
  destDir: string;
  dryRun: boolean;
  extension?: string;
  oldManifestFiles?: string[];
}): Promise<{
  copied: number;
  skipped: number;
  removed: number;
  files: string[];
}> {
  if (!opts.dryRun) {
    await mkdir(opts.destDir, { recursive: true });
  }

  const ext = opts.extension ?? ".md";
  const assetFiles = (await readdir(opts.srcDir)).filter((f) =>
    f.endsWith(ext),
  );

  let copied = 0;
  let skipped = 0;

  const errors: string[] = [];
  for (const file of assetFiles) {
    try {
      const result = await copyIfChanged(
        join(opts.srcDir, file),
        join(opts.destDir, file),
        opts.dryRun,
      );
      if (result === "copied") copied++;
      else skipped++;
    } catch (err) {
      errors.push(`${file}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Remove files that were in the old manifest but no longer in the package
  let removed = 0;
  if (opts.oldManifestFiles) {
    for (const oldFile of opts.oldManifestFiles) {
      if (!assetFiles.includes(oldFile)) {
        if (!opts.dryRun) {
          try {
            await unlink(join(opts.destDir, oldFile));
          } catch {
            // Already gone
          }
        }
        removed++;
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(`Failed to copy ${errors.length} file(s):\n  ${errors.join("\n  ")}`);
  }

  return { copied, skipped, removed, files: assetFiles };
}

/**
 * Back up a file to the UluOps backup directory before modifying it.
 * No-op if the source file doesn't exist.
 */
export async function backupFile(
  srcPath: string,
  backupDir: string,
): Promise<void> {
  try {
    await access(srcPath);
  } catch {
    return; // Nothing to back up
  }
  await mkdir(backupDir, { recursive: true });
  const filename = basename(srcPath);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  await copyFile(srcPath, join(backupDir, `${filename}.${timestamp}.bak`));
}
