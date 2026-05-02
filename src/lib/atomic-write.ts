/**
 * Atomic Write
 *
 * Write-to-temp-then-rename pattern to prevent partial writes
 * from corrupting user config files.
 */

import { writeFile, rename, unlink, chmod } from "node:fs/promises";

export interface AtomicWriteOptions {
  /** File mode (permissions). Defaults to Node's default (0o666 before umask). */
  mode?: number;
}

export async function atomicWrite(
  path: string,
  content: string,
  options?: AtomicWriteOptions,
): Promise<void> {
  const tmp = `${path}.uluops-tmp`;
  try {
    await writeFile(tmp, content, { encoding: "utf-8", mode: options?.mode });
    if (options?.mode) {
      // Ensure mode is applied even if umask is permissive
      await chmod(tmp, options.mode);
    }
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
