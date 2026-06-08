import chalk from "chalk";
import { join } from "node:path";
import { readdir } from "node:fs/promises";
import { detect } from "../steps/detect.js";
import { signup } from "../steps/signup.js";
import { resolveApiKey, hasCredentialsFile, writeCredentialsFile } from "../steps/auth.js";
import { installMcp } from "../steps/mcp.js";
import type { McpResult } from "../steps/mcp.js";
import { installAgents } from "../steps/agents.js";
import type { AgentsResult } from "../steps/agents.js";
import { installCommands } from "../steps/commands.js";
import type { CommandsResult } from "../steps/commands.js";
import { installSkills } from "../steps/skills.js";
import type { SkillsResult } from "../steps/skills.js";
import { installMetrics } from "../steps/metrics.js";
import type { MetricsResult } from "../steps/metrics.js";
import { installCli, CLI_PACKAGE } from "../steps/cli.js";
import type { CliExecutor, CliInstallResult } from "../steps/cli.js";
import {
  installAgentMetricsCli,
  AGENT_METRICS_PACKAGE,
  AGENT_METRICS_BIN,
} from "../steps/agent-metrics-cli.js";
import type {
  AgentMetricsCliExecutor,
  AgentMetricsCliInstallResult,
} from "../steps/agent-metrics-cli.js";
import { writeShellExport } from "../steps/shell.js";
import { probeHookSupport } from "../lib/settings-merger.js";
import { findProjectRoot, ASSETS_DIR } from "../lib/paths.js";
import { getHealthTimeout } from "../lib/health.js";
import { ok, warn, fail, info } from "../lib/display.js";
import type { HarnessProfile } from "../harnesses/index.js";
import { ConflictRejectedError } from "./errors.js";

/**
 * Decide whether to ask the user "Are you creating a new account?".
 * The prompt is the new-user friction-reducer — it should fire only when
 * the user has provided no other signal about who they are.
 *
 * Skip the prompt when:
 *  - `--signup` is set (forces signup path)
 *  - `--api-key` flag is provided (user already has a key)
 *  - `ULUOPS_API_KEY` env var is set (CI/automation)
 *  - `--yes` is passed (non-interactive)
 *  - stdin is not a TTY (piped / background)
 *  - a credentials file already exists (returning user)
 */
async function shouldPromptForAccount(opts: {
  apiKey?: string;
  signup: boolean;
  yes: boolean;
}): Promise<boolean> {
  if (opts.signup) return false;
  if (opts.apiKey) return false;
  if (process.env["ULUOPS_API_KEY"]) return false;
  if (opts.yes) return false;
  if (!process.stdin.isTTY) return false;
  if (await hasCredentialsFile()) return false;
  return true;
}

/** Resolve API key via flag, env, file, signup, or interactive prompt. Returns env detection + key. */
export async function initContext(opts: {
  apiKey?: string;
  signup: boolean;
  skipValidation: boolean;
  yes: boolean;
  dryRun?: boolean;
}): Promise<{ env: Awaited<ReturnType<typeof detect>>; apiKey: string }> {
  const env = await detect();
  let apiKey: string;
  let resolvedEmail: string | null = null;
  // Capture before auth runs — a successful resolve via the credentials file
  // would otherwise create the appearance of "no prior file" after the fact.
  const credsExistedAtStart = await hasCredentialsFile();

  let creatingAccount = opts.signup;
  if (!opts.signup && (await shouldPromptForAccount(opts))) {
    const { confirm } = await import("@inquirer/prompts");
    creatingAccount = await confirm({
      message: "Are you creating a new UluOps account?",
      default: true,
    });
    console.log();
  }

  let credsSource: "signup" | "flag" | "prompt" = "flag";
  try {
    if (creatingAccount) {
      info("Create your UluOps account\n");
      const auth = await signup();
      apiKey = auth.apiKey;
      resolvedEmail = auth.email;
      credsSource = "signup";
      ok(`Account created (${auth.email})`);
      ok(`API key generated`);
    } else {
      const interactive =
        !opts.yes && !opts.apiKey && !process.env["ULUOPS_API_KEY"];
      const auth = await resolveApiKey({
        apiKeyFlag: opts.apiKey,
        skipValidation: opts.skipValidation,
        interactive,
      });
      apiKey = auth.apiKey;
      resolvedEmail = auth.email;
      credsSource =
        opts.apiKey || process.env["ULUOPS_API_KEY"] ? "flag" : "prompt";
      if (auth.email) ok(`Key validated (${auth.email})`);
      else if (opts.skipValidation) ok("Key accepted (validation skipped)");
      else ok("Key validated");
    }
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  // Persist the key locally so @uluops/cli and the SDK can read it from disk.
  // Always write after signup (key was just minted, nothing else holds it).
  // Otherwise write only if there was no prior file — avoids churning
  // createdAt on every returning-user invocation.
  if (credsSource === "signup" || !credsExistedAtStart) {
    try {
      await writeCredentialsFile(apiKey, {
        email: resolvedEmail,
        source: credsSource,
        dryRun: opts.dryRun,
      });
      if (!opts.dryRun) ok("Credentials saved → ~/.uluops/credentials.json");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      warn(`Could not save credentials to ~/.uluops/credentials.json: ${msg}`);
      // On signup, the warn() above is the ONLY surface that names the failure.
      // The key was just minted; if we don't persist it and don't surface it,
      // the user has no path back to it short of minting another one.
      // Print recovery context so the message is actionable, not just a flag.
      if (credsSource === "signup") {
        warn(
          "  Your key was generated but is not on disk for @uluops/cli to read.",
        );
        warn(
          "  Copy it from the MCP config block written above (look for ULUOPS_API_KEY)",
        );
        warn("  or pass --skip-validation --api-key <key> on the next run.");
      }
    }
  }

  return { env, apiKey };
}

/** Write MCP server entries to harness config and report warnings. */
export async function configureMcpStep(
  profile: HarnessProfile,
  apiKey: string,
  opts: { scope: "global" | "local"; dryRun: boolean },
): Promise<McpResult> {
  const res = await installMcp(profile, apiKey, opts.scope, opts.dryRun);
  ok(`MCP config → ${res.configPath} (2 servers)`);
  for (const w of res.packageWarnings) warn(w);
  return res;
}

/** Copy agent definitions from assets to harness directory. */
export async function installAgentsDefs(
  profile: HarnessProfile,
  opts: { localDefs: boolean; dryRun: boolean },
  prev?: string[],
): Promise<AgentsResult> {
  const res = await installAgents(profile, opts.localDefs, opts.dryRun, prev);
  const parts: string[] = [];
  if (res.copied > 0) parts.push(`${res.copied} copied`);
  if (res.skipped > 0) parts.push(`${res.skipped} unchanged`);
  if (res.removed > 0) parts.push(`${res.removed} removed`);
  const dest = opts.localDefs
    ? "./uluops/agents/"
    : `${profile.paths.agentsDir.replace(process.env["HOME"] ?? "", "~")}/`;
  ok(
    `${res.files.length} agents → ${dest}${parts.length ? ` (${parts.join(", ")})` : ""}`,
  );
  // Per-file copy failures are non-fatal — surface them so the user knows
  // re-running setup will retry the unwritten files.
  for (const f of res.failures) {
    warn(`Failed to copy agent ${f.file}: ${f.error} — re-run setup to retry`);
  }
  return res;
}

/** Copy slash-command definitions from assets (Claude Code only). */
export async function installCommandsDefs(
  profile: HarnessProfile,
  opts: { localDefs: boolean; dryRun: boolean },
  prev?: string[],
): Promise<CommandsResult> {
  const res = await installCommands(
    profile,
    opts.localDefs,
    opts.dryRun,
    prev,
  );
  if (res.skippedReason === "not-supported") {
    info(
      chalk.dim(
        `Commands not yet supported for ${profile.displayName} (coming soon)`,
      ),
    );
    return res;
  }
  const total = res.agentCommands + res.workflowCommands + res.pipelineCommands;
  const parts: string[] = [];
  if (total > 0) parts.push(`${total} copied`);
  if (res.skipped > 0) parts.push(`${res.skipped} unchanged`);
  if (res.removed > 0) parts.push(`${res.removed} removed`);
  const dest = opts.localDefs
    ? "./uluops/commands/"
    : `${profile.paths.commandsDir.replace(process.env["HOME"] ?? "", "~")}/`;
  ok(
    `${res.files.length} commands → ${dest}${parts.length ? ` (${parts.join(", ")})` : ""}`,
  );
  // Per-file copy failures are non-fatal — surface them so the user knows
  // re-running setup will retry the unwritten files.
  for (const f of res.failures) {
    warn(`Failed to copy command ${f.file}: ${f.error} — re-run setup to retry`);
  }
  return res;
}

/** Copy Codex-style skills from assets to the harness directory. */
export async function installSkillsDefs(
  profile: HarnessProfile,
  opts: { localDefs: boolean; dryRun: boolean },
  prev?: string[],
): Promise<SkillsResult> {
  const res = await installSkills(profile, opts.localDefs, opts.dryRun, prev);
  if (res.skippedReason === "not-supported") {
    return res;
  }
  const parts: string[] = [];
  if (res.copied > 0) parts.push(`${res.copied} copied`);
  if (res.skipped > 0) parts.push(`${res.skipped} unchanged`);
  if (res.removed > 0) parts.push(`${res.removed} removed`);
  const dest = opts.localDefs
    ? "./uluops/skills/"
    : `${(profile.paths.skillsDir ?? "").replace(process.env["HOME"] ?? "", "~")}/`;
  ok(
    `${res.files.length} skills → ${dest}${parts.length ? ` (${parts.join(", ")})` : ""}`,
  );
  for (const f of res.failures) {
    warn(`Failed to copy skill ${f.file}: ${f.error} — re-run setup to retry`);
  }
  return res;
}

/** Install agent-metrics hook and tool files (Claude Code only). */
export async function configureMetricsStep(
  profile: HarnessProfile,
  opts: { dryRun: boolean },
): Promise<MetricsResult> {
  if (!profile.hooks) {
    info(
      chalk.dim(
        `Metrics hooks not supported for ${profile.displayName}`,
      ),
    );
    return { toolFilesCopied: 0, hookConfigured: false, hooksInstalledVersion: null };
  }

  const probe = probeHookSupport();
  if (probe.warning) warn(probe.warning);

  const res = await installMetrics(profile, opts.dryRun);
  if (res.hookConfigured) {
    const parts: string[] = [];
    if (res.toolFilesCopied > 0) parts.push(`${res.toolFilesCopied} files`);
    parts.push("hook configured");
    const toolPath = profile.paths.toolsDir?.replace(
      process.env["HOME"] ?? "",
      "~",
    );
    ok(`Agent metrics → ${toolPath}/ (${parts.join(", ")})`);
  } else {
    warn("Agent metrics hook not configured (tool files not found)");
  }
  return res;
}

/**
 * Decide whether to install `@uluops/cli` globally and do it (or not).
 *
 * Decision matrix:
 * - `--no-cli` (opts.cli === false) → skip, no prompt
 * - `--with-cli` (opts.withCli === true) → install, no prompt
 * - Neither flag + non-interactive (--yes / --api-key / no TTY) → skip
 * - Neither flag + interactive → prompt (default Y)
 *
 * Returns null when the step did not run (skipped). Returns a `CliInstallResult`
 * when an install attempt was made, with details for the manifest.
 */
export async function configureCliStep(opts: {
  withCli?: boolean;
  cli?: boolean;
  yes: boolean;
  apiKey?: string;
  dryRun: boolean;
  executor?: CliExecutor;
}): Promise<CliInstallResult | null> {
  if (opts.cli === false) {
    info(chalk.dim(`Skipped global ${CLI_PACKAGE} install (--no-cli)`));
    return null;
  }

  let shouldInstall: boolean;
  if (opts.withCli === true) {
    shouldInstall = true;
  } else {
    const nonInteractive =
      opts.yes || !!opts.apiKey || !process.stdin.isTTY;
    if (nonInteractive) {
      info(
        chalk.dim(
          `Skipped global ${CLI_PACKAGE} install (non-interactive — pass --with-cli to install)`,
        ),
      );
      return null;
    }
    const { confirm } = await import("@inquirer/prompts");
    shouldInstall = await confirm({
      message: `Install ${CLI_PACKAGE} globally (provides the ${chalk.cyan("ulu")} command)?`,
      default: true,
    });
    if (!shouldInstall) {
      info(chalk.dim(`Skipped global ${CLI_PACKAGE} install`));
      return null;
    }
  }

  const res = await installCli({
    dryRun: opts.dryRun,
    executor: opts.executor,
  });

  if (opts.dryRun && !res.alreadyPresent) {
    ok(`Would install ${CLI_PACKAGE} globally`);
    return res;
  }
  if (res.alreadyPresent) {
    ok(
      `${CLI_PACKAGE} already installed${res.version ? ` (${res.version})` : ""} — no change`,
    );
    return res;
  }
  if (res.installed) {
    ok(
      `${CLI_PACKAGE} installed globally${res.version ? ` (${res.version})` : ""}`,
    );
    return res;
  }
  warn(
    `Could not install ${CLI_PACKAGE} globally — try ${chalk.cyan(`npm install -g ${CLI_PACKAGE}`)} manually`,
  );
  if (res.error) {
    const oneLine = res.error.split("\n")[0]?.slice(0, 120) ?? "";
    if (oneLine) info(chalk.dim(`  ${oneLine}`));
  }
  return res;
}

/**
 * Decide whether to install `@uluops/agent-metrics` globally and do it.
 *
 * Only meaningful when the SubagentStop hook actually got configured —
 * otherwise the CLI has no captures to read. Caller gates on
 * `metricsResult.hookConfigured`.
 *
 * Decision matrix mirrors `configureCliStep`:
 * - `--no-agent-metrics-cli` (opts.agentMetricsCli === false) → skip, no prompt
 * - `--with-agent-metrics-cli` (opts.withAgentMetricsCli === true) → install, no prompt
 * - Neither flag + non-interactive (--yes / --api-key / no TTY) → skip
 * - Neither flag + interactive → prompt (default Y)
 *
 * Returns null when the step did not run (skipped). Returns an install result
 * when an attempt was made, for manifest recording.
 */
export async function configureAgentMetricsCliStep(opts: {
  withAgentMetricsCli?: boolean;
  agentMetricsCli?: boolean;
  yes: boolean;
  apiKey?: string;
  dryRun: boolean;
  executor?: AgentMetricsCliExecutor;
}): Promise<AgentMetricsCliInstallResult | null> {
  if (opts.agentMetricsCli === false) {
    info(
      chalk.dim(
        `Skipped global ${AGENT_METRICS_PACKAGE} install (--no-agent-metrics-cli)`,
      ),
    );
    return null;
  }

  let shouldInstall: boolean;
  if (opts.withAgentMetricsCli === true) {
    shouldInstall = true;
  } else {
    const nonInteractive =
      opts.yes || !!opts.apiKey || !process.stdin.isTTY;
    if (nonInteractive) {
      info(
        chalk.dim(
          `Skipped global ${AGENT_METRICS_PACKAGE} install (non-interactive — pass --with-agent-metrics-cli to install)`,
        ),
      );
      return null;
    }
    const { confirm } = await import("@inquirer/prompts");
    shouldInstall = await confirm({
      message: `Install ${AGENT_METRICS_PACKAGE} globally (provides the ${chalk.cyan(AGENT_METRICS_BIN)} command for reading captures)?`,
      default: true,
    });
    if (!shouldInstall) {
      info(chalk.dim(`Skipped global ${AGENT_METRICS_PACKAGE} install`));
      return null;
    }
  }

  const res = await installAgentMetricsCli({
    dryRun: opts.dryRun,
    executor: opts.executor,
  });

  if (opts.dryRun && !res.alreadyPresent) {
    ok(`Would install ${AGENT_METRICS_PACKAGE} globally`);
    return res;
  }
  if (res.alreadyPresent) {
    ok(
      `${AGENT_METRICS_PACKAGE} already installed${res.version ? ` (${res.version})` : ""} — no change`,
    );
    return res;
  }
  if (res.installed) {
    ok(
      `${AGENT_METRICS_PACKAGE} installed globally${res.version ? ` (${res.version})` : ""}`,
    );
    return res;
  }
  warn(
    `Could not install ${AGENT_METRICS_PACKAGE} globally — try ${chalk.cyan(`npm install -g ${AGENT_METRICS_PACKAGE}`)} manually`,
  );
  if (res.error) {
    const oneLine = res.error.split("\n")[0]?.slice(0, 120) ?? "";
    if (oneLine) info(chalk.dim(`  ${oneLine}`));
  }
  return res;
}

/** Ping tracker and registry health endpoints. */
export async function runHealthCheck(opts: {
  skipValidation: boolean;
  dryRun: boolean;
}): Promise<void> {
  if (!opts.skipValidation && !opts.dryRun) {
    try {
      const [trackerOk, registryOk] = await Promise.all([
        checkEndpoint("https://api.uluops.ai/api/v1/health"),
        checkEndpoint("https://api.uluops.ai/api/v1/registry/health"),
      ]);
      if (trackerOk && registryOk)
        ok("Health check passed — both APIs reachable");
      else
        warn(
          "Some APIs unreachable (MCP tools may have limited functionality)",
        );
    } catch {
      warn("Health check skipped (network issue)");
    }
  }
}

/** Optionally write ULUOPS_API_KEY export to shell profile. */
export async function configureShell(
  env: { shellProfile: string | null },
  apiKey: string,
  opts: { shell: boolean; yes: boolean; dryRun: boolean },
): Promise<boolean> {
  let modified = false;
  if (opts.shell && env.shellProfile) {
    if (!opts.yes && !opts.dryRun) {
      const confirmed = await confirmShellWrite(env.shellProfile);
      if (!confirmed) {
        warn("Skipped writing API key to shell profile");
        return false;
      }
    }
    await writeShellExport(env.shellProfile, apiKey, opts.dryRun);
    ok(`ULUOPS_API_KEY added to ${env.shellProfile}`);
    warn(
      "API key stored in plaintext in shell profile. Consider rotating if shared machine.",
    );
    modified = true;
  } else if (opts.shell) {
    warn(
      "--shell requested but no supported shell detected ($SHELL). Skipping.",
    );
  }
  return modified;
}

/** Interactive y/N confirmation before writing API key to shell profile. */
export async function confirmShellWrite(profilePath: string): Promise<boolean> {
  const readline = await import("node:readline/promises");
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const answer = await rl.question(
    `Write ULUOPS_API_KEY to ${profilePath}? (y/N) `,
  );
  rl.close();
  return answer.trim().toLowerCase() === "y";
}

/** Warn if existing agent files will be overwritten and prompt for confirmation. */
export async function checkConflicts(
  profile: HarnessProfile,
  localDefs: boolean,
): Promise<void> {
  const destDir = localDefs
    ? join(await findProjectRoot(), "uluops", "agents")
    : profile.paths.agentsDir;
  const srcDir = join(ASSETS_DIR, profile.name, "agents");

  let existingFiles: string[];
  let assetFiles: string[];
  try {
    existingFiles = await readdir(destDir);
    assetFiles = await readdir(srcDir);
  } catch {
    return;
  }

  const conflicts = assetFiles.filter((f) => existingFiles.includes(f));
  if (conflicts.length === 0) return;

  warn(
    `Found ${conflicts.length} existing agents that match UluOps definitions:`,
  );
  for (const f of conflicts.slice(0, 5)) {
    info(`  ${f}`);
  }
  if (conflicts.length > 5) {
    info(`  ... and ${conflicts.length - 5} more`);
  }
  console.log();
  info("These will be overwritten.");
  console.log();

  const { confirm } = await import("@inquirer/prompts");
  const proceed = await confirm({ message: "Continue?", default: true });
  if (!proceed) {
    // Throw instead of process.exit so the multi-harness loop can catch and
    // continue with sibling harnesses. The single-harness CLI top-level
    // handler catches ConflictRejectedError and exits 0 cleanly, preserving
    // today's UX. (Spec §7.5; replaces the prior process.exit(0).)
    throw new ConflictRejectedError(profile.name);
  }
}

/** Fetch a URL and return true if the response is OK, false on any failure. */
async function checkEndpoint(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(getHealthTimeout()),
    });
    return res.ok;
  } catch {
    return false;
  }
}
