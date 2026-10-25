import chalk from "chalk";
import { dirname, join } from "node:path";
import { rmdir } from "node:fs/promises";
import {
  loadManifest,
  saveManifest,
} from "../lib/manifest.js";
import type {
  HarnessManifest,
  Manifest,
  PartialStep,
} from "../lib/manifest.js";
import { localDefsRoot } from "../lib/paths.js";
import { uninstallAgents } from "../steps/agents.js";
import { uninstallCommands } from "../steps/commands.js";
import { uninstallSkills } from "../steps/skills.js";
import {
  info,
  warn,
  blank,
  printSetupBanner,
  printHarnessHeader,
  printSetupSummary,
} from "../lib/display.js";
import { getVersion } from "../lib/version.js";
import { getProfile } from "../harnesses/index.js";
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
import {
  classifyExit,
  type PerHarnessResult,
} from "./per-harness.js";
import type { AgentsResult } from "../steps/agents.js";
import type { CommandsResult } from "../steps/commands.js";
import type { SkillsResult } from "../steps/skills.js";
import type { MetricsResult } from "../steps/metrics.js";
import type { McpResult } from "../steps/mcp.js";
import { maybeSetUsername } from "../steps/username.js";

// Re-export so existing import sites that pull PerHarnessResult from
// setup.ts keep working.
export type { PerHarnessResult } from "./per-harness.js";

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
  /**
   * When true, skip the agent-metrics hook step entirely. configureMetricsStep
   * short-circuits with a "skipped via --no-metrics" status. The agent-metrics
   * CLI prompt is also suppressed downstream (no hook → no CLI gate).
   */
  noMetrics?: boolean;
  /** Explicit registry username (slug). Set + confirmed non-interactively when provided. */
  username?: string;
}

/**
 * The main install flow: resolves every target harness up front (fail-fast on
 * typos), runs the once-per-run steps (auth, username, CLI prompts) a single
 * time, then installs MCP config, definitions, and the metrics hook per
 * harness with failure isolation — one harness failing does not abort the
 * others. Exits 1 if any harness failed operationally.
 */
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

  const targetSummary = profiles.length === 1
    ? profiles[0]!.displayName
    : `${profiles.length} harnesses (${profiles.map((p) => p.displayName).join(", ")})`;
  printSetupBanner(version, targetSummary);

  if (opts.dryRun) {
    info(chalk.dim("(dry run — no changes will be made)\n"));
  }

  // === Once-per-run: BEFORE the per-harness loop ===
  const { env, apiKey } = await initContext(opts);
  blank();

  // Optional, never-forced: offer to set a registry username (the one-time
  // prerequisite for creating/publishing definitions). Skipped silently in
  // non-interactive runs unless --username is supplied.
  await maybeSetUsername({
    apiKey,
    username: opts.username,
    interactive: !opts.yes && Boolean(process.stdin.isTTY),
    dryRun: opts.dryRun,
    emit: (msg) => info(msg),
  });
  blank();

  // Acquire the install lock before touching any shared state. Skipped on
  // dry-run (read-only). The lock excludes a second concurrent uluops-setup
  // from racing the manifest / MCP config / shell-profile / settings.json
  // read-merge-write windows. Held across the entire multi-harness loop —
  // concurrent multi-harness installs from separate processes serialize
  // (spec §10.6).
  let lock: LockHandle | null = null;
  let exitCode = 0;
  if (!opts.dryRun) {
    lock = await acquireInstallLock();
  }

  try {
    const existingManifest = await loadManifest();

    if (existingManifest && existingManifest.version !== version) {
      info(
        `Updating ${chalk.dim(existingManifest.version)} → ${chalk.green(version)}`,
      );
      blank();
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

      printHarnessHeader(profile.displayName);

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
            blank();
            continue;
          }
          // Operational failure (e.g. unreadable dest dir, non-TTY refusal):
          // classify-and-continue like the MCP branch below — rethrowing
          // escaped the per-harness loop, leaving installed siblings with NO
          // manifest record and skipping later harnesses (audit pass 6,
          // PROBE D). classifyExit yields 1 for a failed result.
          perHarnessResults.push({
            harnessName,
            profile,
            status: "failed",
            error: err instanceof Error ? err.message : String(err),
          });
          warn(
            `[${harnessName}] conflict check failed — continuing with remaining harnesses`,
          );
          blank();
          continue;
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
        blank();
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

      blank();
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
      // Clone rather than alias: mutating the loaded object would silently
      // change what any later `existingManifest` read sees. Today all reads
      // precede this block — the clone keeps that a non-condition instead of
      // an ordering invariant someone has to remember.
      const manifest: Manifest = existingManifest
        ? structuredClone(existingManifest)
        : {
            version,
            installedAt: now,
            shellModified: false,
            harnesses: {},
          };
      manifest.version = version;
      manifest.installedAt = now;
      manifest.shellModified = shellModified || manifest.shellModified;

      // Prior trees in the pre-0.19 shared local layout (`<project>/uluops/`)
      // that a harness moved out of on this run. Cleaned up after the loop,
      // once we know whether any harness still records them.
      const vacatedSharedTrees: {
        harnessName: string;
        path: string;
        entry: HarnessManifest;
      }[] = [];

      for (const r of perHarnessResults) {
        if (!r.mcpResult) continue; // no MCP success → no entry
        // A step that THREW produced no result — falling back to [] here
        // would replace a populated prior entry with an empty record,
        // orphaning every previously-installed file the moment a re-run
        // fails (uninstall trusts these lists). Undefined result = keep the
        // prior record; the `partial` marker names what didn't complete.
        const prevEntry = existingManifest?.harnesses[r.harnessName];
        const newDefsScope = opts.localDefs ? "local" : "global";
        const newDefsPath = opts.localDefs
          ? await localDefsRoot(r.harnessName)
          : r.profile.paths.home;
        // TWO gates, deliberately: the FILE LISTS live under defsPath and
        // may only be inherited for the SAME tree — same scope and same path
        // (a list against another tree points uninstall at the wrong files).
        // The path half was added in 0.19.0: local trees moved to
        // `<project>/uluops/<harness>/`, and findProjectRoot now walks to the
        // real repo root, so a local re-run can land at a new path with the
        // scope unchanged. The HOOK fields live in settings.json under
        // profile.paths — tree-independent — and gating them on defsScope
        // falsified hooksInstalled on a scope flip (audit pass 6, PROBE C).
        const prevLists =
          prevEntry &&
          prevEntry.defsScope === newDefsScope &&
          prevEntry.defsPath === newDefsPath
            ? prevEntry
            : undefined;
        const prevHooks = prevEntry;
        if (prevEntry && !prevLists) {
          const isVacatedSharedTree =
            prevEntry.defsScope === "local" &&
            newDefsScope === "local" &&
            prevEntry.defsPath === dirname(newDefsPath);
          if (isVacatedSharedTree) {
            // The one move we can identify with certainty: the retired
            // shared layout, in the same project. Cleaned up below.
            vacatedSharedTrees.push({
              harnessName: r.harnessName,
              path: prevEntry.defsPath,
              entry: prevEntry,
            });
          } else {
            // Any other move — a scope flip, a different project, or the
            // project-root walk now finding the repo root — leaves the old
            // tree in place. A local install in another project looks the
            // same as a move from here, so deleting would be wrong.
            warn(
              `[${r.harnessName}] definitions location changed (${prevEntry.defsPath} → ${newDefsPath}): previously installed files remain untracked at ${prevEntry.defsPath}`,
            );
          }
        }
        if (
          prevEntry &&
          prevEntry.mcpConfigPath !== r.mcpResult.configPath
        ) {
          warn(
            `[${r.harnessName}] MCP config location changed (${prevEntry.mcpConfigPath} → ${r.mcpResult.configPath}): the UluOps server entries in the old file were left in place`,
          );
        }
        // A metrics result whose skippedReason is set NEVER OBSERVED the
        // hook state ("--no-metrics" means don't touch metrics; unsupported
        // harnesses too) — `??` alone can't express that because false is a
        // value. Only an observing run may change the recorded hook state.
        const metricsObserved =
          r.metricsResult !== undefined && !r.metricsResult.skippedReason;
        const harnessEntry: HarnessManifest = {
          installedAt: now,
          setupVersion: version,
          mcpScope: opts.scope,
          mcpConfigPath: r.mcpResult.configPath,
          defsScope: newDefsScope,
          defsPath: newDefsPath,
          agents: r.agentsResult?.files ?? prevLists?.agents ?? [],
          commands: r.commandsResult?.files ?? prevLists?.commands ?? [],
          skills: r.skillsResult?.files ?? prevLists?.skills ?? [],
          hooksInstalled: metricsObserved
            ? (r.metricsResult?.hookConfigured ?? false)
            : (prevHooks?.hooksInstalled ?? false),
          hooksInstalledVersion: metricsObserved
            ? (r.metricsResult?.hooksInstalledVersion ?? null)
            : (prevHooks?.hooksInstalledVersion ?? null),
          partial: r.partial ?? null,
        };
        manifest.harnesses[r.harnessName] = harnessEntry;
      }

      await cleanUpVacatedSharedTrees(vacatedSharedTrees, manifest);

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
    // Single rendering call producing the full multi-harness block with
    // per-harness status icons, partial markers, re-run hints, and the
    // aggregate counts in the header. Single-harness path preserves
    // today's Setup-complete banner format inside the same function.
    try {
      await printSetupSummary({
        results: perHarnessResults,
        apiKey,
        scope: {
          mcpScope: opts.scope,
          defsScope: opts.localDefs ? "local" : "global",
        },
      });
    } catch (err) {
      // A render failure must not invert the run outcome: the install and
      // manifest write already happened — classifyExit below is the
      // authority, not the pretty-printer.
      warn(
        `Could not render the setup summary: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    // Exit-code classifier (spec §7.5 4-tier table). One call, one place.
    // Empty perHarnessResults already short-circuited above with the
    // "nothing to install" message; classifyExit handles defense-in-depth.
    exitCode = classifyExit(perHarnessResults);
  } finally {
    if (lock) await lock.release();
  }
  // process.exit inside the try would skip the finally and leave the lock
  // held (the signal handlers are a backstop, not the contract) — classify
  // inside, exit only after cleanup has run.
  if (exitCode !== 0) {
    process.exit(exitCode);
  }
}

/**
 * Remove files a harness recorded in the pre-0.19 shared local tree
 * (`<project>/uluops/`) after it moved to `<project>/uluops/<harness>/`.
 *
 * Only once NO manifest entry still records that tree: a harness not in this
 * run may still be installed there, and the harnesses' file names overlap,
 * so deleting one harness's list would break the other. Such a tree is left
 * in place with a warning naming who still uses it; re-running setup for
 * those harnesses moves them and the last one out cleans up. Only recorded
 * files are removed, as `--uninstall` does.
 */
async function cleanUpVacatedSharedTrees(
  vacated: { harnessName: string; path: string; entry: HarnessManifest }[],
  manifest: Manifest,
): Promise<void> {
  const byPath = new Map<string, typeof vacated>();
  for (const v of vacated) {
    byPath.set(v.path, [...(byPath.get(v.path) ?? []), v]);
  }
  for (const [path, movers] of byPath) {
    const stillUsing = Object.entries(manifest.harnesses)
      .filter(([, hm]) => hm.defsPath === path)
      .map(([name]) => name);
    const movedNames = movers.map((m) => m.harnessName).join(", ");
    if (stillUsing.length > 0) {
      warn(
        `[${movedNames}] moved to a per-harness folder; the shared tree at ${path} is left in place because ${stillUsing.join(", ")} still use it. Re-run setup for ${stillUsing.join(", ")} to move them too.`,
      );
      continue;
    }
    try {
      let removed = 0;
      for (const { entry } of movers) {
        removed += await uninstallAgents(entry.agents, path);
        removed += await uninstallCommands(entry.commands, path);
        removed += await uninstallSkills(entry.skills ?? [], path);
      }
      // Then the directories they leave empty, deepest first. rmdir refuses
      // a non-empty directory, so anything the user keeps there survives.
      for (const dir of [
        "commands/agents",
        "commands/workflows",
        "commands/pipelines",
        "commands",
        "agents",
        "skills",
      ]) {
        await rmdir(join(path, dir)).catch(() => undefined);
      }
      info(
        `Moved ${movedNames} to per-harness folders; removed ${String(removed)} file(s) from the shared tree at ${path}`,
      );
    } catch (err) {
      warn(
        `Could not clean up the shared tree at ${path}: ${err instanceof Error ? err.message : String(err)} — those files are no longer tracked`,
      );
    }
  }
}
