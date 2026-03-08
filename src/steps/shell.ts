import { readFile, writeFile } from "node:fs/promises";

const FENCE_START = "# --- UluOps (managed by @uluops/setup) ---";
const FENCE_END = "# --- /UluOps ---";

export async function writeShellExport(
  profilePath: string,
  apiKey: string,
  dryRun: boolean,
): Promise<void> {
  const block = `${FENCE_START}\nexport ULUOPS_API_KEY="${apiKey}"\n${FENCE_END}`;

  let content: string;
  try {
    content = await readFile(profilePath, "utf-8");
  } catch {
    if (!dryRun) {
      await writeFile(profilePath, block + "\n");
    }
    return;
  }

  const startIdx = content.indexOf(FENCE_START);
  const endIdx = content.indexOf(FENCE_END);

  if (startIdx !== -1 && endIdx !== -1) {
    // Replace existing fenced block
    const before = content.slice(0, startIdx);
    const after = content.slice(endIdx + FENCE_END.length);
    if (!dryRun) {
      await writeFile(profilePath, before + block + after);
    }
  } else {
    // Append
    if (!dryRun) {
      await writeFile(profilePath, content.trimEnd() + "\n\n" + block + "\n");
    }
  }
}

export async function removeShellExport(profilePath: string): Promise<void> {
  let content: string;
  try {
    content = await readFile(profilePath, "utf-8");
  } catch {
    return;
  }

  const startIdx = content.indexOf(FENCE_START);
  const endIdx = content.indexOf(FENCE_END);

  if (startIdx !== -1 && endIdx !== -1) {
    const before = content.slice(0, startIdx);
    const after = content.slice(endIdx + FENCE_END.length);
    await writeFile(profilePath, (before + after).replace(/\n{3,}/g, "\n\n"));
  }
}
