/**
 * Settings Merger
 *
 * Safe read/merge/remove for Claude Code's settings.json.
 * Only touches UluOps-managed hook entries — all other settings preserved.
 */

import { readFile } from "node:fs/promises";
import { atomicWrite } from "./atomic-write.js";
import { stripDangerousKeys } from "./json-guards.js";
import { isEnoent } from "./file-ops.js";

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
  "SubagentStart",
  "SubagentStop",
  "PreToolUse",
  "PostToolUse",
  "Notification",
  "Stop",
]);

/** Default Claude Code hook event used when no override is configured. */
export const DEFAULT_CLAUDE_HOOK_TYPE = "SubagentStop";

/**
 * The companion event installed beside the default one (agent-metrics 0.12.0,
 * dvc checklist X4-1). agent-metrics records which agent definition a subagent was
 * spawned with at SubagentStart and confirms it at SubagentStop; Claude Code loads a
 * subagent's definition at spawn, so a stop-time read alone would record a
 * definition reinstalled mid-run. Same command: the hook dispatches on
 * `hook_event_name`. Installed only with the default event — a user who overrode
 * the event type (ULUOPS_HOOK_TYPE) gets exactly what they asked for.
 */
export const CLAUDE_SPAWN_HOOK_TYPE = "SubagentStart";

/**
 * The third companion event (agent-metrics 0.14.0; effectiveness-analytics D67): on
 * `PreToolUse` for the Agent tool, agent-metrics hashes the `[target:]` artifacts named in
 * the subagent's prompt before the subagent starts. It is the only hook that sees the
 * prompt at spawn (SubagentStart carries no tool_use_id in Claude Code 2.1.316).
 *
 * **Version-gated, for safety, not compatibility.** agent-metrics before 0.14.0 answers
 * every event but SubagentStart with `{"decision":"approve"}`, which on `PreToolUse`
 * permits the call without the user's permission prompt. So the event is registered only
 * when the installed agent-metrics is at least {@link TARGET_HOOK_MIN_METRICS_VERSION},
 * and removed again when it is not (a downgrade). The matcher keeps it off every other
 * tool call.
 */
export const CLAUDE_TARGET_HOOK_TYPE = "PreToolUse";
export const CLAUDE_TARGET_HOOK_MATCHER = "Agent|Task";
export const TARGET_HOOK_MIN_METRICS_VERSION = "0.14.0";

/** True when `version` (an installed agent-metrics version) is at least 0.14.0. Unknown is false. */
export function metricsSupportsTargetHook(version: string | null | undefined): boolean {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(version ?? "");
  if (!m) return false;
  const [maj, min] = [Number(m[1]), Number(m[2])];
  return maj > 0 || min >= 14;
}

/** The matcher setup writes for an event type it manages, if any. */
export function claudeHookMatcherFor(type: string): string | undefined {
  return type === CLAUDE_TARGET_HOOK_TYPE ? CLAUDE_TARGET_HOOK_MATCHER : undefined;
}

/**
 * The hook event types setup manages for Claude Code, given the resolved primary type and
 * the installed agent-metrics version (which gates `PreToolUse`, see above).
 */
export function claudeManagedHookTypes(
  primary: string = getDefaultHookEventType(),
  metricsVersion: string | null = null,
): string[] {
  if (primary !== DEFAULT_CLAUDE_HOOK_TYPE) return [primary];
  return metricsSupportsTargetHook(metricsVersion)
    ? [primary, CLAUDE_SPAWN_HOOK_TYPE, CLAUDE_TARGET_HOOK_TYPE]
    : [primary, CLAUDE_SPAWN_HOOK_TYPE];
}

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
  } catch (err) {
    if (isEnoent(err)) return {}; // File doesn't exist — fresh config
    // Unreadable-but-PRESENT must never read as fresh (see isEnoent's doc).
    throw new Error(
      `Could not read settings at ${path} (${err instanceof Error ? err.message : String(err)}) — refusing to continue rather than overwrite a file that exists but could not be read. Nothing was modified.`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // The read happens BEFORE any write — say so, or a pre-existing broken
    // file reads as UluOps-caused corruption.
    throw new Error(
      `Failed to parse settings at ${path} — file contains invalid JSON. ` +
        `(Detected before any UluOps change; nothing was modified. Fix or remove the file and re-run.)`,
    );
  }
  // Same rationale as the JSON throw above: a shape we can't merge into must
  // surface, not crash mid-merge or silently corrupt on spread. Valid JSON
  // that isn't an object (or whose hooks aren't matcher arrays) is treated
  // as unmergeable, not coerced.
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(
      `Failed to parse settings at ${path} — expected a JSON object at the top level`,
    );
  }
  const hooks = (parsed as { hooks?: unknown }).hooks;
  if (hooks !== undefined) {
    const hooksValid =
      typeof hooks === "object" &&
      hooks !== null &&
      !Array.isArray(hooks) &&
      Object.values(hooks).every(
        (v) =>
          Array.isArray(v) &&
          v.every((m) => typeof m === "object" && m !== null),
      );
    if (!hooksValid) {
      throw new Error(
        `Failed to parse settings at ${path} — 'hooks' has an unexpected shape; fix or remove it and re-run`,
      );
    }
  }
  return stripDangerousKeys(parsed) as HarnessSettings;
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
 * True when a matcher entry is a UluOps-owned hook. THE single ownership
 * predicate — merge, remove, and has must all use it, or they disagree on
 * malformed shapes (the exact defect this replaced: merge was defensive
 * while remove/has dereferenced m.hooks unguarded and crashed uninstall/
 * verify on hand-edited files). Defensive by design: readSettings' gate
 * deliberately tolerates unknown-shaped user entries (no hooks array,
 * non-string commands) so the merge can preserve them — anything not
 * positively identifiable as ours is user data: preserved by remove,
 * invisible to has, never a crash.
 */
function isUluopsMatcher(m: HookMatcher): boolean {
  return (
    Array.isArray(m?.hooks) &&
    m.hooks.some(
      (h) =>
        typeof h?.command === "string" &&
        h.command.includes(HOOK_OWNERSHIP_SIGNATURE),
    )
  );
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

  const filtered = existing.filter((m) => !isUluopsMatcher(m));

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
  if (!Array.isArray(hookEntries)) return settings;

  const filtered = hookEntries.filter((m) => !isUluopsMatcher(m));

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
  if (!Array.isArray(hookEntries)) return false;
  return hookEntries.some(isUluopsMatcher);
}
