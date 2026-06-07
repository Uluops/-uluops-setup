import { platform, release } from "node:os";
import { access } from "node:fs/promises";
import { getClaudeHome, getShellProfile } from "../lib/paths.js";
import { detectHarnesses } from "../harnesses/index.js";
import type { HarnessProfile } from "../harnesses/index.js";

export interface Environment {
  os: "linux" | "darwin" | "win32";
  isWsl: boolean;
  shell: string | null;
  shellProfile: string | null;
  nodeVersion: string;
  claudeHomeExists: boolean;
  detectedHarnesses: HarnessProfile[];
}

const SUPPORTED_PLATFORMS = new Set<string>(["linux", "darwin", "win32"]);

/** Detect the current environment: OS, shell, Node version, harnesses, and Claude home status. */
export async function detect(): Promise<Environment> {
  const p = platform();
  if (!SUPPORTED_PLATFORMS.has(p)) {
    throw new Error(
      `Unsupported platform: ${p}. Expected linux, darwin, or win32.`,
    );
  }
  const os = p as Environment["os"];
  if (os === "win32") {
    throw new Error(
      "Windows (native) is not supported. Please use WSL2 (Ubuntu) and run setup inside WSL.",
    );
  }
  const isWsl =
    os === "linux" && release().toLowerCase().includes("microsoft");
  const profile = getShellProfile();
  const nodeVersion = process.version;
  // Standard process.version is v-prefixed semver ("v20.10.0"). We take the
  // major after stripping the "v". The `?? "0"` removed from the prior version
  // here was dead code — `"".split(".")` returns `[""]`, not an empty array,
  // so the nullish coalesce never fired and an unparseable major silently
  // resulted in NaN, which then fell through the `< 20` gate.
  const majorVersion = parseInt(nodeVersion.slice(1).split(".")[0] ?? "", 10);

  if (Number.isNaN(majorVersion)) {
    // Defense in depth: a tampered binary, a wrapper that spoofs
    // process.version, or a future Node release that breaks the v-prefixed
    // semver convention would all silently pass the major-version gate.
    // Reject with a distinct error so the user sees "your runtime is wrong"
    // rather than the misleading "requires Node.js 20 or higher."
    throw new Error(
      `Cannot parse Node.js version "${nodeVersion}". ` +
        `@uluops/setup requires a standard v-prefixed semver (e.g., v20.10.0).`,
    );
  }

  if (majorVersion < 20) {
    throw new Error(
      `Unsupported Node.js version: ${nodeVersion}. @uluops/setup requires Node.js 20 or higher.`,
    );
  }

  let claudeHomeExists = false;
  try {
    await access(getClaudeHome());
    claudeHomeExists = true;
  } catch {
    // Does not exist
  }

  const detectedHarnesses = detectHarnesses();

  return {
    os,
    isWsl,
    shell: profile?.shell ?? null,
    shellProfile: profile?.path ?? null,
    nodeVersion,
    claudeHomeExists,
    detectedHarnesses,
  };
}
