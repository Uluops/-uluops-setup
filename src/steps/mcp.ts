import { readFile, access } from "node:fs/promises";
import { join } from "node:path";
import type { HarnessProfile } from "../harnesses/index.js";
import { checkMcpPackageAvailability } from "../lib/config-merger.js";
import { findProjectRoot, getBackupDir } from "../lib/paths.js";
import { atomicWrite } from "../lib/atomic-write.js";
import { backupFile } from "../lib/file-ops.js";

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
    // Backup before first write
    await backupConfig(profile.name, configPath);
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
  await backupConfig(profile.name, configPath);
  const config = await profile.mcpConfig.read(configPath);
  const cleaned = profile.mcpConfig.remove(config);
  await profile.mcpConfig.write(configPath, cleaned);
}

async function backupConfig(
  harnessName: string,
  configPath: string,
): Promise<void> {
  await backupFile(configPath, getBackupDir(harnessName));
}

async function addToGitignore(localConfigFilename: string): Promise<void> {
  const root = await findProjectRoot();
  const gitignorePath = join(root, ".gitignore");
  try {
    await access(join(root, ".git"));
  } catch {
    return;
  }

  try {
    const content = await readFile(gitignorePath, "utf-8");
    if (content.includes(localConfigFilename)) return;
    await atomicWrite(
      gitignorePath,
      content.trimEnd() + `\n${localConfigFilename}\n`,
    );
  } catch {
    await atomicWrite(gitignorePath, `${localConfigFilename}\n`);
  }
}
