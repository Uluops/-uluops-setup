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
 * Reconcile a manifest's old file list against the current source set,
 * unlinking the files that were installed previously but are no longer in
 * the source. Returns the count of files that would have been removed
 * (whether or not the unlink actually ran in dry-run mode).
 *
 * Extracted from three near-identical blocks in syncAssets, installAgents,
 * and installCommands. Errors from unlink are swallowed silently — the
 * "already gone" case is the dominant one (idempotent re-run, manual user
 * deletion, prior failed install), and there's no recovery the caller
 * can usefully perform mid-loop.
 */
export async function removeStaleFiles(
  destDir: string,
  oldManifestFiles: string[] | undefined,
  currentFiles: string[],
  dryRun: boolean,
): Promise<number> {
  if (!oldManifestFiles) return 0;
  let removed = 0;
  for (const oldFile of oldManifestFiles) {
    if (!currentFiles.includes(oldFile)) {
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
  const removed = await removeStaleFiles(
    opts.destDir,
    opts.oldManifestFiles,
    assetFiles,
    opts.dryRun,
  );

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
