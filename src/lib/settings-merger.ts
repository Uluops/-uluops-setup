/**
 * Settings Merger
 *
 * Safe read/merge/remove for Claude Code's settings.json.
 * Only touches UluOps-managed hook entries — all other settings preserved.
 */

import { readFile, writeFile } from "node:fs/promises";

interface HookEntry {
  type: string;
  command: string;
  timeout?: number;
}

interface HookMatcher {
  matcher?: string;
  hooks: HookEntry[];
}

interface ClaudeSettings {
  permissions?: Record<string, unknown>;
  hooks?: Record<string, HookMatcher[]>;
  [key: string]: unknown;
}

/** Marker embedded in hook commands to identify UluOps-managed entries */
const ULUOPS_HOOK_MARKER = "tools/agent-metrics";

/** Supported hook event types in Claude Code. Update when Claude Code adds/renames types. */
const SUPPORTED_HOOK_TYPES = new Set([
  "SubagentStop",
  "PreToolUse",
  "PostToolUse",
  "Notification",
  "Stop",
]);

/** Configurable hook type via env var. Falls back to SubagentStop. */
function getHookEventType(): string {
  return process.env["ULUOPS_HOOK_TYPE"] ?? "SubagentStop";
}

export interface HookProbeResult {
  hookType: string;
  supported: boolean;
  warning?: string;
}

/** Check whether the configured hook event type is in the known supported set. Returns the resolved hook type and a warning if unsupported. */
export function probeHookSupport(): HookProbeResult {
  const hookType = getHookEventType();
  if (SUPPORTED_HOOK_TYPES.has(hookType)) {
    return { hookType, supported: true };
  }
  return {
    hookType,
    supported: false,
    warning: `Hook type "${hookType}" is not in the known supported set {${[...SUPPORTED_HOOK_TYPES].join(", ")}}. Metrics may silently fail if this hook type does not exist in Claude Code.`,
  };
}

/**
 * Read an existing settings.json, or return empty object if it doesn't exist.
 */
export async function readSettings(path: string): Promise<ClaudeSettings> {
  try {
    const raw = await readFile(path, "utf-8");
    return JSON.parse(raw) as ClaudeSettings;
  } catch {
    return {};
  }
}

/**
 * Write settings back to file with stable formatting.
 */
export async function writeSettings(
  path: string,
  settings: ClaudeSettings,
): Promise<void> {
  await writeFile(path, JSON.stringify(settings, null, 2) + "\n");
}

/**
 * Merge the UluOps SubagentStop hook into settings, preserving all other
 * hooks and settings. If a UluOps hook already exists, it is replaced.
 */
export function mergeUluopsHook(
  settings: ClaudeSettings,
  hookCommand: string,
): ClaudeSettings {
  const hookType = getHookEventType();
  const hooks = settings.hooks ?? {};
  const existing = hooks[hookType] ?? [];

  const filtered = existing.filter(
    (m) => !m.hooks.some((h) => h.command.includes(ULUOPS_HOOK_MARKER)),
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

  return {
    ...settings,
    hooks: {
      ...hooks,
      [hookType]: [...filtered, uluopsHook],
    },
  };
}

/**
 * Remove UluOps hook entries from settings. If SubagentStop becomes empty,
 * the key is removed. If hooks becomes empty, the key is removed.
 */
export function removeUluopsHook(settings: ClaudeSettings): ClaudeSettings {
  const hookType = getHookEventType();
  const hooks = settings.hooks;
  if (!hooks) return settings;

  const hookEntries = hooks[hookType];
  if (!hookEntries) return settings;

  const filtered = hookEntries.filter(
    (m) => !m.hooks.some((h) => h.command.includes(ULUOPS_HOOK_MARKER)),
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
export function hasUluopsHook(settings: ClaudeSettings): boolean {
  const hookType = getHookEventType();
  const hookEntries = settings.hooks?.[hookType];
  if (!hookEntries) return false;
  return hookEntries.some((m) =>
    m.hooks.some((h) => h.command.includes(ULUOPS_HOOK_MARKER)),
  );
}
