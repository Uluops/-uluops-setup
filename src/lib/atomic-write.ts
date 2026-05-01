/**
 * Atomic Write
 *
 * Write-to-temp-then-rename pattern to prevent partial writes
 * from corrupting user config files.
 */

import { writeFile, rename, unlink } from "node:fs/promises";

export async function atomicWrite(
  path: string,
  content: string,
): Promise<void> {
  const tmp = `${path}.uluops-tmp`;
  try {
    await writeFile(tmp, content, "utf-8");
    await rename(tmp, path);
  } catch (err) {
    // Clean up temp file on failure
    try {
      await unlink(tmp);
    } catch {
      // Temp file may not exist
    }
    throw err;
  }
}
