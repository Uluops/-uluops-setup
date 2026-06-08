/**
 * Atomic Write
 *
 * Write-to-temp-then-rename pattern to prevent partial writes
 * from corrupting user config files.
 */

import { writeFile, rename, unlink, chmod } from "node:fs/promises";
import { randomBytes } from "node:crypto";

export interface AtomicWriteOptions {
  /** File mode (permissions). Defaults to Node's default (0o666 before umask). */
  mode?: number;
}

export async function atomicWrite(
  path: string,
  content: string,
  options?: AtomicWriteOptions,
): Promise<void> {
  // Random suffix + 'wx' flag (O_CREAT|O_EXCL) prevents symlink races:
  // an attacker cannot pre-position a symlink at an unpredictable path,
  // and 'wx' fails atomically rather than following one that exists.
  const tmp = `${path}.uluops-tmp.${randomBytes(8).toString("hex")}`;
  try {
    await writeFile(tmp, content, {
      encoding: "utf-8",
      mode: options?.mode,
      flag: "wx",
    });
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
