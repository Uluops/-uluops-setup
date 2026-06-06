import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { atomicWrite } from "../lib/atomic-write.js";
import { backupFile } from "../lib/file-ops.js";
import { getUluopsDir } from "../lib/paths.js";

const FENCE_START = "# --- UluOps (managed by @uluops/setup) ---";
const FENCE_END = "# --- /UluOps ---";

/** Characters safe for shell variable values (no metacharacters). */
const SAFE_KEY_PATTERN = /^[a-zA-Z0-9_\-\.]+$/;

/** Write a fenced ULUOPS_API_KEY export block into the user's shell profile, replacing any existing UluOps block. */
export async function writeShellExport(
  profilePath: string,
  apiKey: string,
  dryRun: boolean,
): Promise<void> {
  if (!SAFE_KEY_PATTERN.test(apiKey)) {
    throw new Error(
      "API key contains characters unsafe for shell export. Only alphanumeric, underscore, hyphen, and dot are allowed.",
    );
  }

  const block = `${FENCE_START}\nexport ULUOPS_API_KEY="${apiKey}"\n${FENCE_END}`;

  let content: string;
  try {
    content = await readFile(profilePath, "utf-8");
  } catch {
    if (!dryRun) {
      await atomicWrite(profilePath, block + "\n", { mode: 0o600 });
    }
    return;
  }

  const startIdx = content.indexOf(FENCE_START);
  const endIdx = content.lastIndexOf(FENCE_END);

  if (!dryRun) {
    await backupProfile(profilePath);
  }

  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    // Replace existing fenced block — using lastIndexOf for FENCE_END collapses
    // any duplicate blocks left by earlier buggy installs into a single new block
    const before = content.slice(0, startIdx);
    const after = content.slice(endIdx + FENCE_END.length);
    if (!dryRun) {
      await atomicWrite(profilePath, before + block + after);
    }
  } else {
    if (!dryRun) {
      await atomicWrite(
        profilePath,
        content.trimEnd() + "\n\n" + block + "\n",
      );
    }
  }
}

/** Remove the fenced UluOps export block from the user's shell profile. */
export async function removeShellExport(profilePath: string): Promise<void> {
  let content: string;
  try {
    content = await readFile(profilePath, "utf-8");
  } catch {
    return;
  }

  const startIdx = content.indexOf(FENCE_START);
  const endIdx = content.lastIndexOf(FENCE_END);

  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    await backupProfile(profilePath);
    const before = content.slice(0, startIdx);
    const after = content.slice(endIdx + FENCE_END.length);
    await atomicWrite(
      profilePath,
      (before + after).replace(/\n{3,}/g, "\n\n"),
    );
  }
}

async function backupProfile(profilePath: string): Promise<void> {
  await backupFile(profilePath, join(getUluopsDir(), "backups", "shell"));
}
