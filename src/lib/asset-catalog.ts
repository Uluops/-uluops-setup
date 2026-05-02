import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { ASSETS_DIR } from "./paths.js";

export interface CommandEntry {
  name: string;
  description: string;
  model: string;
}

/**
 * Parse YAML-like frontmatter from a markdown file.
 * Returns key-value pairs between the opening and closing `---`.
 */
function parseFrontmatter(content: string): Record<string, string> {
  const lines = content.split("\n");
  if (lines[0]?.trim() !== "---") return {};
  const result: Record<string, string> = {};
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.trim() === "---") break;
    const colonIdx = line.indexOf(":");
    if (colonIdx > 0) {
      const key = line.slice(0, colonIdx).trim();
      const value = line.slice(colonIdx + 1).trim();
      result[key] = value;
    }
  }
  return result;
}

/** Scan a commands subdirectory and return sorted entries with frontmatter metadata. */
async function scanCommandDir(dir: string): Promise<CommandEntry[]> {
  let files: string[];
  try {
    files = await readdir(dir);
  } catch {
    return [];
  }

  const entries: CommandEntry[] = [];
  for (const file of files.filter((f) => f.endsWith(".md"))) {
    const content = await readFile(join(dir, file), "utf-8");
    const fm = parseFrontmatter(content);
    if (fm["name"]) {
      entries.push({
        name: fm["name"],
        description: fm["description"] ?? "",
        model: fm["model"] ?? "sonnet",
      });
    }
  }
  return entries.sort((a, b) => a.name.localeCompare(b.name));
}

/** Get all agent command entries from assets. */
export async function getAgentCommands(): Promise<CommandEntry[]> {
  return scanCommandDir(join(ASSETS_DIR, "commands", "agents"));
}

/** Get all workflow command entries from assets. */
export async function getWorkflowCommands(): Promise<CommandEntry[]> {
  return scanCommandDir(join(ASSETS_DIR, "commands", "workflows"));
}
