/**
 * Harness Registry
 *
 * Central registry for harness profiles. Resolves names/aliases
 * and detects installed harnesses.
 */

import { existsSync } from "node:fs";
import type { HarnessProfile } from "./types.js";
import { claudeCodeProfile } from "./claude-code.js";
import { opencodeProfile } from "./opencode.js";
import { geminiCliProfile } from "./gemini-cli.js";
import { codexProfile } from "./codex.js";

export type {
  HarnessProfile,
  HarnessPaths,
  McpConfigStrategy,
  HookStrategy,
} from "./types.js";
export {
  ConfigParseError,
  HarnessNotTestedError,
} from "./types.js";

export const ALL_PROFILES: readonly HarnessProfile[] = [
  claudeCodeProfile,
  opencodeProfile,
  geminiCliProfile,
  codexProfile,
];

const aliases = new Map<string, string>([
  ["claude", "claude-code"],
  ["oc", "opencode"],
  ["gemini", "gemini-cli"],
]);

/** Resolve a harness name or alias to a canonical name. */
export function resolveHarnessName(input: string): string {
  return aliases.get(input) ?? input;
}

/** Get a harness profile by name or alias. Throws if not found. */
export function getProfile(name: string): HarnessProfile {
  const resolved = resolveHarnessName(name);
  const profile = ALL_PROFILES.find((p) => p.name === resolved);
  if (!profile) {
    const available = ALL_PROFILES.map((p) => p.name).join(", ");
    throw new Error(
      `Unknown harness "${name}". Available: ${available}`,
    );
  }
  return profile;
}

/**
 * Detect which harnesses are installed by probing home directories.
 *
 * Excludes experimental profiles even when their home dir is present:
 * auto-detection should never return a profile that will throw
 * HarnessNotTestedError on use. Users can still opt in with
 * `--harness <name>`, which goes through getProfile() and surfaces the
 * explicit error message — the relational promise "in the detected
 * list = safe to install" is preserved.
 */
export function detectHarnesses(): HarnessProfile[] {
  return ALL_PROFILES.filter((p) => p.status === "stable" && existsSync(p.paths.home));
}

/** List all available harness names (not aliases). */
export function listHarnesses(): string[] {
  return ALL_PROFILES.map((p) => p.name);
}
