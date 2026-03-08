import { platform, release } from "node:os";
import { access } from "node:fs/promises";
import { getClaudeHome, getShellProfile } from "../lib/paths.js";

export interface Environment {
  os: "linux" | "darwin" | "win32";
  isWsl: boolean;
  shell: string | null;
  shellProfile: string | null;
  nodeVersion: string;
  claudeHomeExists: boolean;
}

export async function detect(): Promise<Environment> {
  const os = platform() as Environment["os"];
  const isWsl = os === "linux" && release().toLowerCase().includes("microsoft");
  const profile = getShellProfile();
  const nodeVersion = process.version;

  let claudeHomeExists = false;
  try {
    await access(getClaudeHome());
    claudeHomeExists = true;
  } catch {
    // Does not exist
  }

  return {
    os,
    isWsl,
    shell: profile?.shell ?? null,
    shellProfile: profile?.path ?? null,
    nodeVersion,
    claudeHomeExists,
  };
}
