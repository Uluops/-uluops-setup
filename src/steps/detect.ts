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

const SUPPORTED_PLATFORMS = new Set<string>(["linux", "darwin", "win32"]);

/** Detect the current environment: OS, shell, Node version, and Claude home status. */
export async function detect(): Promise<Environment> {
  const p = platform();
  if (!SUPPORTED_PLATFORMS.has(p)) {
    throw new Error(`Unsupported platform: ${p}. Expected linux, darwin, or win32.`);
  }
  const os = p as Environment["os"];
  // Block native Windows; require WSL2 instead
  if (os === "win32") {
    throw new Error(
      "Windows (native) is not supported. Please use WSL2 (Ubuntu) and run setup inside WSL."
    );
  }
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
