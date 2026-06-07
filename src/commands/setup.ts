import chalk from "chalk";
import { join } from "node:path";
import {
  loadManifest,
  saveManifest,
} from "../lib/manifest.js";
import type {
  HarnessManifest,
  Manifest,
  PartialStep,
} from "../lib/manifest.js";
import { findProjectRoot } from "../lib/paths.js";
import { info, printSetupSummary, warn } from "../lib/display.js";
import { getVersion } from "../lib/version.js";
import { getProfile } from "../harnesses/index.js";
import type { HarnessProfile } from "../harnesses/index.js";
import {
  acquireInstallLock,
  type LockHandle,
} from "../lib/install-lock.js";
import {
  initContext,
  checkConflicts,
  configureMcpStep,
  installAgentsDefs,
  installCommandsDefs,
  installSkillsDefs,
  configureMetricsStep,
  configureCliStep,
  configureAgentMetricsCliStep,
  runHealthCheck,
  configureShell,
} from "./helpers.js";
import { ConflictRejectedError } from "./errors.js";
import type { AgentsResult } from "../steps/agents.js";
import type { CommandsResult } from "../steps/commands.js";
import type { SkillsResult } from "../steps/skills.js";
import type { MetricsResult } from "../steps/metrics.js";
import type { McpResult } from "../steps/mcp.js";

/**
 * Per-harness outcome captured by the orchestrator loop. The exit-code
 * classifier (spec §7.5) decides the process exit code from the set of
 * statuses across all harnesses in the run.
 */
export interface PerHarnessResult {
  harnessName: string;
  profile: HarnessProfile;
  status: "ok" | "failed" | "declined";
  error?: string;
  mcpResult?: McpResult;
  agentsResult?: AgentsResult;
  commandsResult?: CommandsResult;
  skillsResult?: SkillsResult;
  metricsResult?: MetricsResult;
  partial?: PartialStep | null;
}

interface RunSetupOpts {
  apiKey?: string;
  signup: boolean;
  scope: "global" | "local";
  localDefs: boolean;
  shell: boolean;
  skipValidation: boolean;
  dryRun: boolean;
  yes: boolean;
  harnesses: string[];
  withCli?: boolean;
  cli?: boolean;
  withAgentMetricsCli?: boolean;
  agentMetricsCli?: boolean;
}

export async function runSetup(opts: RunSetupOpts): Promise<void> {
  if (opts.harnesses.length === 0) {
    info(
      chalk.dim(
        "Nothing to install — re-run with at least one harness selected.\n",
      ),
    );
    return;
  }

  const version = await getVersion();
  // Resolve every harness up front so a typo fails fast before any state
  // is touched. getProfile throws HarnessNotTestedError or a friendly
  // unknown-name error; the top-level catch in cli.ts surfaces them.
  const profiles = opts.harnesses.map((name) => getProfile(name));

  console.log();
  console.log(
    `  ${chalk.dim("⟨u⟩")} ${chalk.cyan.bold("ulu")}${chalk.bold("·ops")}`,
  );
  console.log(
    `      ${chalk.dim("operating intelligence as infrastructure")}`,
  );
  console.log();
  const targetSummary = profiles.length === 1
    ? profiles[0]!.displayName
    : `${profiles.length} harnesses (${profiles.map((p) => p.displayName).join(", ")})`;
  console.log(`  Setup v${version} — ${chalk.bold(targetSummary)}`);
  console.log();

  if (opts.dryRun) {
    info(chalk.dim("(dry run — no changes will be made)\n"));
  }

  // === Once-per-run: BEFORE the per-harness loop ===
  const { env, apiKey } = await initContext(opts);
  console.log();

  // Acquire the install lock before touching any shared state. Skipped on
  // dry-run (read-only). The lock excludes a second concurrent uluops-setup
  // from racing the manifest / MCP config / shell-profile / settings.json
  // read-merge-write windows. Held across the entire multi-harness loop —
  // concurrent multi-harness installs from separate processes serialize
  // (spec §10.6).
  let lock: LockHandle | null = null;
  if (!opts.dryRun) {
    lock = await acquireInstallLock();
  }

  try {
    const existingManifest = await loadManifest();

    if (existingManifest && existingManifest.version !== version) {
      info(
        `Updating ${chalk.dim(existingManifest.version)} → ${chalk.green(version)}`,
      );
      console.log();
    }

    // === Per-harness loop ===
    const perHarnessResults: PerHarnessResult[] = [];

    for (const profile of profiles) {
      const harnessName = profile.name;
      // Read each harness's own slice of prior state every iteration. Never
      // reuse a single existingHarness across iterations — installAgents/
      // Commands/Skills consume prev lists from existingHarness for drift
      // detection; using the wrong harness's prev list silently orphans
      // files (spec §7.6.1 per-iteration state isolation).
      const existingHarness = existingManifest?.harnesses[harnessName];

      console.log(chalk.dim(`▸ ${profile.displayName}`));

      if (existingHarness && !existingHarness.partial) {
        info(chalk.dim(`  Already installed at v${version} — checking for changes`));
      }

      // First-install conflict check, OR re-run after a partial install
      // (the user never confirmed the conflict on the failing run, so we
      // re-prompt — spec §7.6.5).
      const needsConflictCheck =
        !opts.yes &&
        !opts.dryRun &&
        (!existingHarness || existingHarness.partial != null);
      if (needsConflictCheck) {
        try {
          await checkConflicts(profile, opts.localDefs);
        } catch (err) {
          if (err instanceof ConflictRejectedError) {
            perHarnessResults.push({
              harnessName,
              profile,
              status: "declined",
              error: err.message,
            });
            warn(
              `[${harnessName}] skipped (user declined conflict) — continuing with remaining harnesses`,
            );
            console.log();
            continue;
          }
          throw err;
        }
      }

      // MCP must succeed for a manifest entry to exist (the entry depends
      // on mcpResult.configPath). An MCP throw means no manifest entry —
      // harness marked failed and the loop continues to siblings.
      let mcpResult: McpResult;
      try {
        mcpResult = await configureMcpStep(profile, apiKey, opts);
      } catch (err) {
        perHarnessResults.push({
          harnessName,
          profile,
          status: "failed",
          error: err instanceof Error ? err.message : String(err),
        });
        warn(
          `[${harnessName}] MCP configuration failed — continuing with remaining harnesses`,
        );
        console.log();
        continue;
      }

      // Subsequent steps may throw on pre-loop work (mkdir EACCES, etc.).
      // If they do, build a partial manifest entry naming the failed step
      // (spec §7.6.2 Case B). The per-file failures[] arrays on each
      // result are surfaced inside the helper's warn() calls.
      let agentsResult: AgentsResult | undefined;
      let commandsResult: CommandsResult | undefined;
      let skillsResult: SkillsResult | undefined;
      let metricsResult: MetricsResult | undefined;
      let failedStep: PartialStep | null = null;
      let failedError: string | undefined;

      try {
        agentsResult = await installAgentsDefs(
          profile,
          opts,
          existingHarness?.agents,
        );
        commandsResult = await installCommandsDefs(
          profile,
          opts,
          existingHarness?.commands,
        );
        skillsResult = await installSkillsDefs(
          profile,
          opts,
          existingHarness?.skills,
        );
        metricsResult = await configureMetricsStep(profile, opts);
      } catch (err) {
        failedError = err instanceof Error ? err.message : String(err);
        failedStep = !agentsResult
          ? "agents"
          : !commandsResult
            ? "commands"
            : !skillsResult
              ? "skills"
              : "metrics";
        warn(
          `[${harnessName}] ${failedStep} step failed: ${failedError} — recording partial state`,
        );
      }

      perHarnessResults.push({
        harnessName,
        profile,
        status: failedStep ? "failed" : "ok",
        error: failedError,
        mcpResult,
        agentsResult,
        commandsResult,
        skillsResult,
        metricsResult,
        partial: failedStep,
      });

      console.log();
    }

    // === Once-per-run: AFTER the per-harness loop ===

    // Global @uluops/cli install — single prompt, single install across the
    // whole run regardless of harness count.
    const cliResult = await configureCliStep({
      withCli: opts.withCli,
      cli: opts.cli,
      yes: opts.yes,
      apiKey: opts.apiKey,
      dryRun: opts.dryRun,
    });

    // Agent-metrics CLI install — gated on AT LEAST ONE harness having
    // successfully configured the hook. Aggregate gate replaces the
    // per-iteration gate from the single-harness version. Without this,
    // a multi-harness run where only one harness supports hooks (e.g.,
    // Claude Code among Codex/Gemini siblings) would never prompt for the
    // agent-metrics CLI (spec §7.6.2 aggregation).
    const anyHookConfigured = perHarnessResults.some(
      (r) => r.status === "ok" && r.metricsResult?.hookConfigured,
    );
    const agentMetricsCliResult = anyHookConfigured
      ? await configureAgentMetricsCliStep({
          withAgentMetricsCli: opts.withAgentMetricsCli,
          agentMetricsCli: opts.agentMetricsCli,
          yes: opts.yes,
          apiKey: opts.apiKey,
          dryRun: opts.dryRun,
        })
      : null;

    await runHealthCheck(opts);

    const shellModified = await configureShell(env, apiKey, opts);

    // Save manifest ONCE at end, aggregating every successful or partial
    // harness entry. Declined harnesses and pre-MCP failures land no entry.
    if (!opts.dryRun) {
      const now = new Date().toISOString();
      const manifest: Manifest = existingManifest ?? {
        version,
        installedAt: now,
        shellModified: false,
        harnesses: {},
      };
      manifest.version = version;
      manifest.installedAt = now;
      manifest.shellModified = shellModified || manifest.shellModified;

      for (const r of perHarnessResults) {
        if (!r.mcpResult) continue; // no MCP success → no entry
        const harnessEntry: HarnessManifest = {
          installedAt: now,
          setupVersion: version,
          mcpScope: opts.scope,
          mcpConfigPath: r.mcpResult.configPath,
          defsScope: opts.localDefs ? "local" : "global",
          defsPath: opts.localDefs
            ? join(await findProjectRoot(), "uluops")
            : r.profile.paths.home,
          agents: r.agentsResult?.files ?? [],
          commands: r.commandsResult?.files ?? [],
          skills: r.skillsResult?.files ?? [],
          hooksInstalled: r.metricsResult?.hookConfigured ?? false,
          hooksInstalledVersion:
            r.metricsResult?.hooksInstalledVersion ?? null,
          partial: r.partial ?? null,
        };
        manifest.harnesses[r.harnessName] = harnessEntry;
      }

      // Same ownership rule as before — only manifest a global install we
      // performed ourselves (not user-installed).
      if (cliResult && cliResult.installed && !cliResult.alreadyPresent) {
        manifest.cliInstalled = true;
        manifest.cliInstalledVersion = cliResult.version;
      }
      if (
        agentMetricsCliResult &&
        agentMetricsCliResult.installed &&
        !agentMetricsCliResult.alreadyPresent
      ) {
        manifest.agentMetricsCliInstalled = true;
        manifest.agentMetricsCliInstalledVersion =
          agentMetricsCliResult.version;
      }

      // Only save the manifest if it has at least one harness entry — the
      // isNewManifest loader rejects empty-harnesses manifests, and saving
      // one would write an unloadable file on every all-declined run.
      if (Object.keys(manifest.harnesses).length > 0) {
        await saveManifest(manifest);
      }
    }

    // === Summary ===
    // Interim per-harness summary for Phase 1. Phase 3.2 replaces this
    // with the full multi-harness summary block (declined/partial markers,
    // re-run hints, aggregate counts).
    for (const r of perHarnessResults) {
      if (r.status !== "ok") continue;
      await printSetupSummary({
        profile: r.profile,
        agentCount: r.agentsResult?.files.length ?? 0,
        commandCount: r.commandsResult?.files.length ?? 0,
        apiKey,
      });
    }

    // Aggregate one-line summary when more than one harness was touched.
    if (perHarnessResults.length > 1) {
      const ok = perHarnessResults.filter((r) => r.status === "ok").length;
      const failed = perHarnessResults.filter((r) => r.status === "failed").length;
      const declined = perHarnessResults.filter((r) => r.status === "declined").length;
      const parts = [`${ok} installed`];
      if (failed) parts.push(`${failed} failed`);
      if (declined) parts.push(`${declined} declined`);
      console.log(
        `  ${chalk.bold(`Multi-harness run:`)} ${parts.join(", ")} of ${perHarnessResults.length}`,
      );
      console.log();
    }

    // Exit-code policy (Phase 1 interim — full classifier comes in Phase 3.2):
    //   any failed → exit 1
    //   any declined + zero failed → exit 0
    //   all ok → exit 0
    // This matches spec §7.5 for the failed/ok cases. The "declined + 0
    // failed → 0 with non-zero summary line" case is exit 0; the line above
    // surfaces the declined count.
    const anyFailed = perHarnessResults.some((r) => r.status === "failed");
    if (anyFailed) {
      process.exit(1);
    }
  } finally {
    if (lock) await lock.release();
  }
}
