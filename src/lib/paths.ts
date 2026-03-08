import { homedir, platform } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Root of the npm package (where assets/ lives) */
export const PACKAGE_ROOT = join(__dirname, "..", "..");

/** Assets directory containing pre-rendered .md files */
export const ASSETS_DIR = join(PACKAGE_ROOT, "assets");

export function getClaudeHome(): string {
  return join(homedir(), ".claude");
}

export function getClaudeJsonPath(): string {
  return join(homedir(), ".claude.json");
}

export function getLocalMcpPath(): string {
  return join(process.cwd(), ".mcp.json");
}

export function getManifestPath(): string {
  return join(getClaudeHome(), "uluops-manifest.json");
}

export function getAgentsDir(localDefs: boolean): string {
  if (localDefs) return join(process.cwd(), "uluops", "agents");
  return join(getClaudeHome(), "agents");
}

export function getCommandsDir(localDefs: boolean): string {
  if (localDefs) return join(process.cwd(), "uluops", "commands");
  return join(getClaudeHome(), "commands");
}

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
