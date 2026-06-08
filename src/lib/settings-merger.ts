/**
 * Settings Merger
 *
 * Safe read/merge/remove for Claude Code's settings.json.
 * Only touches UluOps-managed hook entries — all other settings preserved.
 */

import { readFile } from "node:fs/promises";
import { atomicWrite } from "./atomic-write.js";

interface HookEntry {
  type: string;
  command: string;
  timeout?: number;
}

interface HookMatcher {
  matcher?: string;
  hooks: HookEntry[];
}

export interface HarnessSettings {
  permissions?: Record<string, unknown>;
  hooks?: Record<string, HookMatcher[]>;
  [key: string]: unknown;
}

/**
 * Substring used purely as an *ownership sentinel* — present in every hook
 * command we install, so we can identify our own entries in `settings.json`
 * without false-positives on the user's hooks.
 *
 * This is intentionally NOT a path constant. The path where the hook lives
 * is derived from each profile's `paths.toolsDir`; if those move (a harness
 * restructure, a custom toolsDir, a future per-instance layout), the
 * signature must remain stable so existing user settings.json entries
 * keep being recognized as UluOps-managed.
 *
 * The current value `agent-metrics/dist/hook.js` is the suffix of every
 * hook command we emit — discriminating enough to avoid colliding with
 * user-named tools while surviving moves of the parent directory.
 */
const HOOK_OWNERSHIP_SIGNATURE = "agent-metrics/dist/hook.js";

/**
 * Supported hook event types in Claude Code's settings.json schema.
 *
 * This set is a snapshot of the harness's vocabulary. When Claude Code
 * adds, renames, or removes hook types, this set rots — the `probeHookSupport`
 * warning will fire on legitimate user configs and (worse) train users to
 * ignore it. The snapshot test in `settings-merger.test.ts` exists to make
 * any change to the set visible in PR review so the warning logic can be
 * re-evaluated.
 *
 * Exported for that test only — runtime callers should use `probeHookSupport`.
 */
export const CLAUDE_HOOK_TYPES = new Set([
  "SubagentStop",
  "PreToolUse",
  "PostToolUse",
  "Notification",
  "Stop",
]);

/** Default Claude Code hook event used when no override is configured. */
export const DEFAULT_CLAUDE_HOOK_TYPE = "SubagentStop";

/** Configurable hook type via env var. Falls back to SubagentStop. */
function getDefaultHookEventType(): string {
  return process.env["ULUOPS_HOOK_TYPE"] ?? DEFAULT_CLAUDE_HOOK_TYPE;
}

export interface HookProbeResult {
  hookType: string;
  supported: boolean;
  warning?: string;
}

/** Check whether the configured hook event type is in the known supported set. Returns the resolved hook type and a warning if unsupported. */
export function probeHookSupport(hookTypeOverride?: string): HookProbeResult {
  const hookType = hookTypeOverride ?? getDefaultHookEventType();
  if (CLAUDE_HOOK_TYPES.has(hookType) || hookType === "AfterTool") {
    return { hookType, supported: true };
  }
  return {
    hookType,
    supported: false,
    warning: `Hook type "${hookType}" is not in the known supported set {${[...CLAUDE_HOOK_TYPES].join(", ")}, AfterTool}. Metrics may silently fail if this hook type does not exist in the harness.`,
  };
}

/**
 * Read an existing settings.json, or return empty object if it doesn't exist.
 * Throws on malformed JSON to prevent silent data loss during merge+write.
 */
export async function readSettings(path: string): Promise<HarnessSettings> {
  let raw: string;
  try {
    raw = await readFile(path, "utf-8");
  } catch {
    return {}; // File doesn't exist — fresh config
  }
  try {
    return JSON.parse(raw) as HarnessSettings;
  } catch {
    throw new Error(`Failed to parse settings at ${path} — file contains invalid JSON`);
  }
}

/**
 * Write settings back to file with stable formatting.
 */
export async function writeSettings(
  path: string,
  settings: HarnessSettings,
): Promise<void> {
  await atomicWrite(path, JSON.stringify(settings, null, 2) + "\n", {
    mode: 0o600,
  });
}

/**
 * Merge the UluOps hook into settings, preserving all other
 * hooks and settings. If a UluOps hook already exists, it is replaced.
 */
export function mergeUluopsHook(
  settings: HarnessSettings,
  hookCommand: string,
  hookTypeOverride?: string,
  matcher?: string,
): HarnessSettings {
  const hookType = hookTypeOverride ?? getDefaultHookEventType();
  const hooks = settings.hooks ?? {};
  const existing = hooks[hookType] ?? [];

  const filtered = existing.filter(
    (m) => !m.hooks.some((h) => h.command.includes(HOOK_OWNERSHIP_SIGNATURE)),
  );

  const uluopsHook: HookMatcher = {
    hooks: [
      {
        type: "command",
        command: hookCommand,
        timeout: 30,
      },
    ],
  };

  if (matcher) {
    uluopsHook.matcher = matcher;
  }

  return {
    ...settings,
    hooks: {
      ...hooks,
      [hookType]: [...filtered, uluopsHook],
    },
  };
}

/**
 * Remove UluOps hook entries from settings. If a hook type becomes empty,
 * the key is removed. If hooks becomes empty, the key is removed.
 */
export function removeUluopsHook(
  settings: HarnessSettings,
  hookTypeOverride?: string,
): HarnessSettings {
  const hookType = hookTypeOverride ?? getDefaultHookEventType();
  const hooks = settings.hooks;
  if (!hooks) return settings;

  const hookEntries = hooks[hookType];
  if (!hookEntries) return settings;

  const filtered = hookEntries.filter(
    (m) => !m.hooks.some((h) => h.command.includes(HOOK_OWNERSHIP_SIGNATURE)),
  );

  const updatedHooks = { ...hooks };
  if (filtered.length === 0) {
    delete updatedHooks[hookType];
  } else {
    updatedHooks[hookType] = filtered;
  }

  const result = { ...settings };
  if (Object.keys(updatedHooks).length === 0) {
    delete result.hooks;
  } else {
    result.hooks = updatedHooks;
  }

  return result;
}

/**
 * Check if a UluOps hook is configured in settings.
 */
export function hasUluopsHook(
  settings: HarnessSettings,
  hookTypeOverride?: string,
): boolean {
  const hookType = hookTypeOverride ?? getDefaultHookEventType();
  const hookEntries = settings.hooks?.[hookType];
  if (!hookEntries) return false;
  return hookEntries.some((m) =>
    m.hooks.some((h) => h.command.includes(HOOK_OWNERSHIP_SIGNATURE)),
  );
}
