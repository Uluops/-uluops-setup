import { homedir, platform } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { access } from "node:fs/promises";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Root of the npm package (where assets/ lives) */
export const PACKAGE_ROOT = join(__dirname, "..", "..");

/** Assets directory containing pre-rendered .md files */
export const ASSETS_DIR = join(PACKAGE_ROOT, "assets");

/** Explicit project root override via --project-root flag or env var. */
let projectRootOverride: string | null = null;

export function setProjectRoot(path: string | null): void {
  projectRootOverride = path;
}

/** Walk upward from cwd to find the nearest directory containing .git or package.json. Falls back to cwd. */
export async function findProjectRoot(): Promise<string> {
  if (projectRootOverride) return projectRootOverride;

  const envRoot = process.env["ULUOPS_PROJECT_ROOT"];
  if (envRoot) return envRoot;

  let dir = process.cwd();
  const root = dirname(dir);
  while (dir !== root) {
    if (await isProjectMarker(dir)) return dir;
    dir = dirname(dir);
  }
  if (await isProjectMarker(dir)) return dir;
  return process.cwd();
}

async function isProjectMarker(dir: string): Promise<boolean> {
  try {
    await access(join(dir, ".git"));
    return true;
  } catch {
    // continue
  }
  try {
    await access(join(dir, "package.json"));
    return true;
  } catch {
    // continue
  }
  return false;
}

/** Return the Claude config home directory (~/.claude by default, or CLAUDE_HOME env override). */
export function getClaudeHome(): string {
  return process.env["CLAUDE_HOME"] ?? join(homedir(), ".claude");
}

/** Return the path to Claude's global config file (~/.claude.json by default, or CLAUDE_JSON_PATH env override). */
export function getClaudeJsonPath(): string {
  const envPath = process.env["CLAUDE_JSON_PATH"];
  if (envPath) return envPath;
  return join(homedir(), ".claude.json");
}

/** Return the path to the project-local MCP config file (.mcp.json in project root). */
export async function getLocalMcpPath(): Promise<string> {
  return join(await findProjectRoot(), ".mcp.json");
}

/** Return the path to the UluOps install manifest file. */
export function getManifestPath(): string {
  return join(getClaudeHome(), "uluops-manifest.json");
}

/** Return the directory where agent .md files should be installed (local or global scope). */
export async function getAgentsDir(localDefs: boolean): Promise<string> {
  if (localDefs) return join(await findProjectRoot(), "uluops", "agents");
  return join(getClaudeHome(), "agents");
}

/** Return the directory where command .md files should be installed (local or global scope). */
export async function getCommandsDir(localDefs: boolean): Promise<string> {
  if (localDefs) return join(await findProjectRoot(), "uluops", "commands");
  return join(getClaudeHome(), "commands");
}

export interface PathProbeResult {
  homeDirExists: boolean;
  jsonFileExists: boolean;
  warnings: string[];
}

/** Probe for Claude Code config paths and report whether they exist. Warnings indicate paths that may have migrated. */
export async function probeClaudePaths(): Promise<PathProbeResult> {
  const warnings: string[] = [];
  let homeDirExists = false;
  let jsonFileExists = false;

  try {
    await access(getClaudeHome());
    homeDirExists = true;
  } catch {
    warnings.push(
      `Claude home directory not found: ${getClaudeHome()}. Claude Code may not be installed or config may have migrated.`,
    );
  }

  try {
    await access(getClaudeJsonPath());
    jsonFileExists = true;
  } catch {
    warnings.push(
      `Claude config file not found: ${getClaudeJsonPath()}. MCP config will be created fresh.`,
    );
  }

  return { homeDirExists, jsonFileExists, warnings };
}

/** Detect the user's shell and return its name and profile path, or null if unsupported. */
export function getShellProfile(): { shell: string; path: string } | null {
  const shell = process.env["SHELL"] ?? "";
  const home = homedir();
  const os = platform();

  if (shell.endsWith("/zsh")) {
    return { shell: "zsh", path: join(home, ".zshrc") };
  }
  if (shell.endsWith("/bash")) {
    const file = os === "darwin" ? ".bash_profile" : ".bashrc";
    return { shell: "bash", path: join(home, file) };
  }
  if (shell.endsWith("/fish")) {
    return {
      shell: "fish",
      path: join(home, ".config", "fish", "config.fish"),
    };
  }
  return null;
}
