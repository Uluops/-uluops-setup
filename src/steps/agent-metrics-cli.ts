import { spawnSync } from "node:child_process";

/**
 * Global install of the @uluops/agent-metrics CLI.
 *
 * Companion to src/steps/cli.ts (which handles @uluops/cli). The agent-metrics
 * package is ALREADY copied into the harness tree by src/steps/metrics.ts
 * (so the SubagentStop hook can invoke dist/hook.js at a fixed path), but
 * that copy never goes on PATH. This step makes the `agent-metrics` command
 * available to users who want to inspect the captures the hook produces.
 *
 * Gated externally by the helper in src/commands/helpers.ts — only invoked
 * when the metrics hook actually got configured.
 */

export const AGENT_METRICS_PACKAGE = "@uluops/agent-metrics";
export const AGENT_METRICS_BIN = "agent-metrics";

export interface AgentMetricsCliExecutor {
  /** Returns the installed CLI version, or null if `agent-metrics` is not on PATH or fails to run. */
  detect: () => string | null;
  /** Best-effort `npm install -g`. Returns ok + captured error for surface display. */
  install: () => { ok: boolean; error?: string };
  /** Best-effort `npm uninstall -g`. Returns ok + captured error. */
  uninstall: () => { ok: boolean; error?: string };
}

/** Default executor — shells out to `agent-metrics` and `npm`. */
export const defaultAgentMetricsExecutor: AgentMetricsCliExecutor = {
  detect: () => {
    const r = spawnSync(AGENT_METRICS_BIN, ["--version"], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    if (r.status !== 0 || !r.stdout) return null;
    return r.stdout.trim() || null;
  },
  install: () => {
    const r = spawnSync("npm", ["install", "-g", AGENT_METRICS_PACKAGE], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (r.status === 0) return { ok: true };
    const stderr = (r.stderr ?? "").toString().trim();
    const stdout = (r.stdout ?? "").toString().trim();
    return { ok: false, error: stderr || stdout || `exit ${r.status}` };
  },
  uninstall: () => {
    const r = spawnSync("npm", ["uninstall", "-g", AGENT_METRICS_PACKAGE], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (r.status === 0) return { ok: true };
    const stderr = (r.stderr ?? "").toString().trim();
    const stdout = (r.stdout ?? "").toString().trim();
    return { ok: false, error: stderr || stdout || `exit ${r.status}` };
  },
};

export interface AgentMetricsCliInstallResult {
  /** `agent-metrics` is on PATH after this step, regardless of how it got there. */
  installed: boolean;
  /** Version string from `agent-metrics --version`, if detectable. */
  version: string | null;
  /** True when `agent-metrics` was already on PATH before we did anything. */
  alreadyPresent: boolean;
  /** Set when our `npm install -g` attempt failed; caller decides how to surface. */
  error?: string;
}

/**
 * Install `@uluops/agent-metrics` globally if not already present.
 *
 * Mirrors `installCli` semantics — never aborts the parent setup flow:
 * - If `agent-metrics` is already on PATH, returns `{ installed: true, alreadyPresent: true }` without touching npm.
 * - If `npm install -g` fails, returns `{ installed: false, error }` so the caller can warn-and-continue.
 * - In dryRun mode, no executor calls happen.
 */
export async function installAgentMetricsCli(opts: {
  dryRun: boolean;
  executor?: AgentMetricsCliExecutor;
}): Promise<AgentMetricsCliInstallResult> {
  const executor = opts.executor ?? defaultAgentMetricsExecutor;
  const existing = executor.detect();
  if (existing !== null) {
    return { installed: true, version: existing, alreadyPresent: true };
  }
  if (opts.dryRun) {
    return { installed: false, version: null, alreadyPresent: false };
  }
  const res = executor.install();
  if (!res.ok) {
    return {
      installed: false,
      version: null,
      alreadyPresent: false,
      error: res.error,
    };
  }
  const after = executor.detect();
  return {
    installed: after !== null,
    version: after,
    alreadyPresent: false,
  };
}

export interface AgentMetricsCliUninstallResult {
  removed: boolean;
  error?: string;
}

/**
 * Uninstall `@uluops/agent-metrics` globally. Best-effort: if the package
 * isn't there, npm exits non-zero on some platforms — we treat that as success.
 */
export async function uninstallAgentMetricsCli(opts: {
  dryRun: boolean;
  executor?: AgentMetricsCliExecutor;
}): Promise<AgentMetricsCliUninstallResult> {
  const executor = opts.executor ?? defaultAgentMetricsExecutor;
  if (opts.dryRun) return { removed: true };
  const before = executor.detect();
  if (before === null) return { removed: true };
  const res = executor.uninstall();
  if (res.ok) return { removed: true };
  const after = executor.detect();
  if (after === null) return { removed: true };
  return { removed: false, error: res.error };
}
