import { readFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { atomicWrite } from "../lib/atomic-write.js";
import { isEnoent } from "../lib/file-ops.js";

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

  // Fish has no `export` builtin — bash syntax in config.fish prints a
  // parse error on EVERY new shell and never sets the variable (silent auth
  // failure + visible breakage). Dialect follows the profile path.
  const isFish = profilePath.endsWith("config.fish");
  const exportLine = isFish
    ? `set -gx ULUOPS_API_KEY "${apiKey}"`
    : `export ULUOPS_API_KEY="${apiKey}"`;
  const block = `${FENCE_START}\n${exportLine}\n${FENCE_END}`;

  let content: string;
  try {
    content = await readFile(profilePath, "utf-8");
  } catch (err) {
    if (!isEnoent(err)) {
      // An unreadable-but-present shell profile must never be treated as
      // absent — the fresh-file write below would replace the user's rc.
      throw new Error(
        `Could not read ${profilePath} (${err instanceof Error ? err.message : String(err)}) — refusing to write the API-key export over a file that exists but could not be read. Nothing was modified.`,
      );
    }
    if (!dryRun) {
      // A fresh fish user may have no ~/.config/fish/ yet — atomicWrite's
      // 'wx' temp open ENOENTs on a missing parent.
      await mkdir(dirname(profilePath), { recursive: true });
      await atomicWrite(profilePath, block + "\n", { mode: 0o600 });
    }
    return;
  }

  const startIdx = content.indexOf(FENCE_START);
  const endIdx = content.lastIndexOf(FENCE_END);

  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    // Replace existing fenced block — using lastIndexOf for FENCE_END collapses
    // any duplicate blocks left by earlier buggy installs into a single new block
    const before = content.slice(0, startIdx);
    const after = content.slice(endIdx + FENCE_END.length);
    if (!dryRun) {
      await atomicWrite(profilePath, before + block + after, { mode: 0o600 });
    }
  } else {
    if (!dryRun) {
      await atomicWrite(
        profilePath,
        content.trimEnd() + "\n\n" + block + "\n",
        { mode: 0o600 },
      );
    }
  }
}

/** Remove the fenced UluOps export block from the user's shell profile. */
export async function removeShellExport(
  profilePath: string,
): Promise<{ removed: boolean; reason?: string }> {
  let content: string;
  try {
    content = await readFile(profilePath, "utf-8");
  } catch (err) {
    if (isEnoent(err)) {
      return { removed: true, reason: "no profile file" }; // nothing to remove
    }
    // Unreadable-but-present: the export (and the plaintext key in it) may
    // still be there — the caller must NOT print success.
    return {
      removed: false,
      reason: `could not read ${profilePath}: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const startIdx = content.indexOf(FENCE_START);
  const endIdx = content.lastIndexOf(FENCE_END);

  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    const before = content.slice(0, startIdx);
    const after = content.slice(endIdx + FENCE_END.length);
    try {
      await atomicWrite(
        profilePath,
        (before + after).replace(/\n{3,}/g, "\n\n"),
        { mode: 0o600 },
      );
    } catch (err) {
      // A write failure must land in the same result shape as a read
      // failure — throwing here escapes past the caller's plaintext-key
      // warning and aborts the rest of uninstall.
      return {
        removed: false,
        reason: `could not rewrite ${profilePath}: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
    return { removed: true };
  }
  return { removed: true, reason: "no export block present" };
}
