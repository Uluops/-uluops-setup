import { spawnSync } from "node:child_process";

export const CLI_PACKAGE = "@uluops/cli";
export const CLI_BIN = "ulu";

/**
 * Maximum time we wait for an `npm install -g` / `npm uninstall -g` to
 * complete before terminating it. Bounded to protect setup from indefinite
 * hangs caused by corporate proxy stalls, lifecycle scripts awaiting stdin,
 * or registry slow-response storms. 5 minutes is generous for an npm install
 * of a small CLI and tight enough that users notice and can intervene.
 */
const NPM_TIMEOUT_MS = 5 * 60_000;

/** Short read; 30s is plenty for `ulu --version`. */
const DETECT_TIMEOUT_MS = 30_000;

export interface CliExecutor {
  /** Returns the installed CLI version, or null if `ulu` is not on PATH or fails to run. */
  detect: () => string | null;
  /** Best-effort `npm install -g`. Returns ok + captured error for surface display. */
  install: () => { ok: boolean; error?: string };
  /** Best-effort `npm uninstall -g`. Returns ok + captured error. */
  uninstall: () => { ok: boolean; error?: string };
}

/** @internal — exported for test access to the timeout-summarization branch. */
export function summarizeSpawnResult(
  r: ReturnType<typeof spawnSync>,
  op: string,
): { ok: boolean; error?: string } {
  if (r.status === 0) return { ok: true };
  if (r.signal === "SIGTERM" && r.status === null) {
    return {
      ok: false,
      error: `npm ${op} exceeded ${NPM_TIMEOUT_MS / 1000}s timeout and was terminated`,
    };
  }
  const stderr = (r.stderr ?? "").toString().trim();
  const stdout = (r.stdout ?? "").toString().trim();
  return { ok: false, error: stderr || stdout || `exit ${r.status}` };
}

/** Default executor — shells out to `ulu` and `npm`. */
export const defaultExecutor: CliExecutor = {
  detect: () => {
    const r = spawnSync(CLI_BIN, ["--version"], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: DETECT_TIMEOUT_MS,
    });
    if (r.status !== 0 || !r.stdout) return null;
    return r.stdout.trim() || null;
  },
  install: () => {
    const r = spawnSync("npm", ["install", "-g", CLI_PACKAGE], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: NPM_TIMEOUT_MS,
    });
    return summarizeSpawnResult(r, "install");
  },
  uninstall: () => {
    const r = spawnSync("npm", ["uninstall", "-g", CLI_PACKAGE], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: NPM_TIMEOUT_MS,
    });
    return summarizeSpawnResult(r, "uninstall");
  },
};

export interface CliInstallResult {
  /** `ulu` is on PATH after this step, regardless of how it got there. */
  installed: boolean;
  /** Version string from `ulu --version`, if detectable. */
  version: string | null;
  /** True when `ulu` was already on PATH before we did anything. */
  alreadyPresent: boolean;
  /** Set when our `npm install -g` attempt failed; caller decides how to surface. */
  error?: string;
}

/**
 * Install `@uluops/cli` globally if not already present.
 *
 * Designed to never abort the parent setup flow:
 * - If `ulu` is already on PATH, returns `{ installed: true, alreadyPresent: true }` without touching npm.
 * - If `npm install -g` fails (permissions, network, nvm prefix surprise), returns
 *   `{ installed: false, error }` so the caller can warn-and-continue.
 * - In dryRun mode, no executor calls happen.
 */
export async function installCli(opts: {
  dryRun: boolean;
  executor?: CliExecutor;
}): Promise<CliInstallResult> {
  const executor = opts.executor ?? defaultExecutor;
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

export interface CliUninstallResult {
  removed: boolean;
  error?: string;
}

/**
 * Uninstall `@uluops/cli` globally. Best-effort: if the package isn't there,
 * npm exits non-zero on some platforms — we treat that as success.
 */
export async function uninstallCli(opts: {
  dryRun: boolean;
  executor?: CliExecutor;
}): Promise<CliUninstallResult> {
  const executor = opts.executor ?? defaultExecutor;
  if (opts.dryRun) return { removed: true };
  const before = executor.detect();
  if (before === null) return { removed: true };
  const res = executor.uninstall();
  if (res.ok) return { removed: true };
  const after = executor.detect();
  if (after === null) return { removed: true };
  return { removed: false, error: res.error };
}
