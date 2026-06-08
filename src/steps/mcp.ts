import { readFile, access } from "node:fs/promises";
import { join } from "node:path";
import type { HarnessProfile } from "../harnesses/index.js";
import { checkMcpPackageAvailability } from "../lib/config-merger.js";
import { findProjectRoot } from "../lib/paths.js";
import { atomicWrite } from "../lib/atomic-write.js";

export interface McpResult {
  configPath: string;
  scope: "global" | "local";
  packageWarnings: string[];
}

/** Write UluOps MCP server entries into a harness's config file. */
export async function installMcp(
  profile: HarnessProfile,
  apiKey: string,
  scope: "global" | "local",
  dryRun: boolean,
): Promise<McpResult> {
  const configPath =
    scope === "global"
      ? profile.paths.globalMcpConfig
      : join(await findProjectRoot(), profile.paths.localMcpConfig);

  const config = await profile.mcpConfig.read(configPath);
  const merged = profile.mcpConfig.merge(config, apiKey);

  const packageWarnings: string[] = [];
  const { missing } = await checkMcpPackageAvailability();
  if (missing.length > 0) {
    packageWarnings.push(
      `npm packages not found in registry: ${missing.join(", ")}. MCP servers may fail to start.`,
    );
  }

  if (!dryRun) {
    await profile.mcpConfig.write(configPath, merged);
  }

  if (scope === "local" && !dryRun) {
    await addToGitignore(profile.paths.localMcpConfig);
  }

  return { configPath, scope, packageWarnings };
}

/** Remove UluOps MCP server entries from the harness config. */
export async function uninstallMcp(
  profile: HarnessProfile,
  configPath: string,
): Promise<void> {
  const config = await profile.mcpConfig.read(configPath);
  const cleaned = profile.mcpConfig.remove(config);
  await profile.mcpConfig.write(configPath, cleaned);
}

async function addToGitignore(localConfigFilename: string): Promise<void> {
  const root = await findProjectRoot();
  try {
    await access(join(root, ".git"));
  } catch {
    return;
  }
  await ensureGitignoreEntry(join(root, ".gitignore"), localConfigFilename);
}

/**
 * Append `entry` to a .gitignore file, creating it if missing.
 *
 * Discriminates ENOENT (file does not exist → create fresh) from other read
 * errors (permission denied, I/O error, EISDIR → warn and skip). The previous
 * implementation caught everything and wrote a single-line file, silently
 * clobbering user content on any read failure.
 *
 * `reader` is injected for testing the error-discrimination behavior; defaults
 * to the real fs reader.
 */
export async function ensureGitignoreEntry(
  gitignorePath: string,
  entry: string,
  reader: (path: string) => Promise<string> = (p) => readFile(p, "utf-8"),
): Promise<void> {
  let content: string;
  try {
    content = await reader(gitignorePath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      await atomicWrite(gitignorePath, `${entry}\n`);
      return;
    }
    console.warn(
      `Warning: could not read ${gitignorePath} (${(err as Error).message}). Skipping .gitignore update.`,
    );
    return;
  }

  if (content.includes(entry)) return;
  await atomicWrite(gitignorePath, content.trimEnd() + `\n${entry}\n`);
}
