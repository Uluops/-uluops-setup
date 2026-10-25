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
/** Lowest supported Node.js release; `engines.node` is pinned to it by detect.test.ts. */
export const NODE_FLOOR = { major: 22, minor: 12 } as const;

function unsupportedNodeMessage(nodeVersion: string): string {
  return (
    `Unsupported Node.js version: ${nodeVersion}. ` +
    `@uluops/setup requires Node.js ${NODE_FLOOR.major}.${NODE_FLOOR.minor} or higher.`
  );
}

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
  // Standard process.version is v-prefixed semver ("v22.12.0"). We take the
  // major after stripping the "v". The `?? "0"` removed from an earlier version
  // here was dead code — `"".split(".")` returns `[""]`, not an empty array,
  // so the nullish coalesce never fired and an unparseable major silently
  // resulted in NaN, which then fell through the version gate.
  const [majorPart, minorPart] = nodeVersion.slice(1).split(".");
  const majorVersion = parseInt(majorPart ?? "", 10);

  if (Number.isNaN(majorVersion)) {
    // Defense in depth: a tampered binary, a wrapper that spoofs
    // process.version, or a future Node release that breaks the v-prefixed
    // semver convention would all silently pass the version gate.
    // Reject with a distinct error so the user sees "your runtime is wrong"
    // rather than the misleading "requires Node.js 22.12 or higher."
    throw new Error(
      `Cannot parse Node.js version "${nodeVersion}". ` +
        `@uluops/setup requires a standard v-prefixed semver (e.g., v22.12.0).`,
    );
  }

  // Floor: 22.12.0 (0.18.0; was 20 through 0.17.x). Node 20 reached end of
  // life on 2026-04-30, and commander 15 declares `>=22.12.0`. Below 22 the
  // major decides; at 22 the minor must parse and be at least 12, because an
  // unparseable minor there cannot be shown to meet the floor; above 22 the
  // minor is not read. `engines` alone does not enforce this: npm only warns
  // (EBADENGINE) unless engine-strict is set.
  if (majorVersion === NODE_FLOOR.major) {
    const minorVersion = parseInt(minorPart ?? "", 10);
    if (Number.isNaN(minorVersion)) {
      throw new Error(
        `Cannot parse Node.js version "${nodeVersion}". ` +
          `@uluops/setup requires a standard v-prefixed semver (e.g., v22.12.0).`,
      );
    }
    if (minorVersion < NODE_FLOOR.minor) {
      throw new Error(unsupportedNodeMessage(nodeVersion));
    }
  } else if (majorVersion < NODE_FLOOR.major) {
    throw new Error(unsupportedNodeMessage(nodeVersion));
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
