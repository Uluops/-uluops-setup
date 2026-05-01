import { readFile, writeFile, access } from "node:fs/promises";
import { join } from "node:path";
import {
  readConfig,
  mergeUluopsMcp,
  removeUluopsMcp,
  writeConfig,
  checkMcpPackageAvailability,
} from "../lib/config-merger.js";
import { getClaudeJsonPath, getLocalMcpPath } from "../lib/paths.js";

export interface McpResult {
  configPath: string;
  scope: "global" | "local";
  packageWarnings: string[];
}

/** Write UluOps MCP server entries (tracker + registry) into Claude's config file. Adds .mcp.json to .gitignore for local scope. */
export async function installMcp(
  apiKey: string,
  scope: "global" | "local",
  dryRun: boolean,
): Promise<McpResult> {
  const configPath = scope === "global" ? getClaudeJsonPath() : await getLocalMcpPath();
  const config = await readConfig(configPath);
  const merged = mergeUluopsMcp(config, apiKey);

  const packageWarnings: string[] = [];
  const { missing } = await checkMcpPackageAvailability();
  if (missing.length > 0) {
    packageWarnings.push(
      `npm packages not found in registry: ${missing.join(", ")}. MCP servers may fail to start.`,
    );
  }

  if (!dryRun) {
    await writeConfig(configPath, merged);
  }

  // If local scope in a git repo, add .mcp.json to .gitignore
  if (scope === "local" && !dryRun) {
    await addToGitignore();
  }

  return { configPath, scope, packageWarnings };
}

/** Remove UluOps MCP server entries from the given config file and write it back. */
export async function uninstallMcp(configPath: string): Promise<void> {
  const config = await readConfig(configPath);
  const cleaned = removeUluopsMcp(config);
  await writeConfig(configPath, cleaned);
}

async function addToGitignore(): Promise<void> {
  const gitignorePath = join(process.cwd(), ".gitignore");
  try {
    await access(join(process.cwd(), ".git"));
  } catch {
    return; // Not a git repo
  }

  try {
    const content = await readFile(gitignorePath, "utf-8");
    if (content.includes(".mcp.json")) return;
    await writeFile(gitignorePath, content.trimEnd() + "\n.mcp.json\n");
  } catch {
    await writeFile(gitignorePath, ".mcp.json\n");
  }
}
