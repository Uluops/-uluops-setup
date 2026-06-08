#!/usr/bin/env node

import { Command } from "commander";
import chalk from "chalk";

import { info, printAgentList } from "./lib/display.js";
import { getVersion } from "./lib/version.js";
import {
  listHarnesses,
  detectHarnesses,
  getProfile,
  HarnessNotTestedError,
} from "./harnesses/index.js";
import type { HarnessProfile } from "./harnesses/index.js";
import { InstallLockHeldError } from "./lib/install-lock.js";
import { runSetup } from "./commands/setup.js";
import { runUninstall } from "./commands/uninstall.js";
import { runVerify } from "./commands/verify.js";
import { ConflictRejectedError } from "./commands/errors.js";
import {
  selectHarnesses,
  HarnessSelectionError,
} from "./cli/select-harnesses.js";

async function main(): Promise<void> {
  const version = await getVersion();

  const program = new Command()
    .name("uluops-setup")
    .description("Zero-friction installer for UluOps agentic harnesses")
    .version(version)
    .option("--api-key <key>", "API key (skip prompt)")
    .option(
      "--signup",
      "Create a new account (email + password, no browser)",
    )
    .option(
      "--harness <name>",
      `Target harness: ${listHarnesses().join(", ")} (aliases: claude, oc, gemini). Accepts comma-separated subset ("claude-code,codex") or "all" to install into every detected stable harness.`,
      "claude-code",
    )
    .option(
      "--all-detected",
      "Install into every detected stable harness. Canonical form; equivalent to --harness all.",
      false,
    )
    .option(
      "--scope <mode>",
      'MCP connectivity scope: "global" (~/.claude.json) or "local" (.mcp.json)',
      "global",
    )
    .option(
      "--local-defs",
      "Save agents/commands locally (./uluops/) for project isolation",
      false,
    )
    .option("--shell", "Write API key export to shell profile", false)
    .option(
      "--with-cli",
      "Install @uluops/cli globally without prompting",
    )
    .option(
      "--no-cli",
      "Skip @uluops/cli install without prompting (takes precedence over --with-cli)",
    )
    .option(
      "--with-agent-metrics-cli",
      "Install @uluops/agent-metrics globally without prompting",
    )
    .option(
      "--no-agent-metrics-cli",
      "Skip @uluops/agent-metrics install without prompting (takes precedence over --with-agent-metrics-cli)",
    )
    .option(
      "--no-metrics",
      "Skip the agent-metrics hook install (no hook configured, no tool files copied)",
    )
    .option("--skip-validation", "Accept API key without verifying", false)
    .option(
      "--list",
      "Show available agents and workflows without installing",
    )
    .option("--verify", "Check existing installation health")
    .option("--uninstall", "Remove all UluOps artifacts")
    .option("--dry-run", "Show what would happen", false)
    .option("-y, --yes", "Skip confirmations", false);

  program.parse();
  const opts = program.opts<{
    apiKey?: string;
    signup: boolean;
    harness: string;
    allDetected: boolean;
    scope: string;
    localDefs: boolean;
    shell: boolean;
    withCli?: boolean;
    cli: boolean;
    withAgentMetricsCli?: boolean;
    agentMetricsCli: boolean;
    metrics: boolean;
    skipValidation: boolean;
    list: boolean;
    verify: boolean;
    uninstall: boolean;
    dryRun: boolean;
    yes: boolean;
  }>();

  if (opts.list) {
    console.log();
    console.log(
      `  ${chalk.dim("⟨u⟩")} ${chalk.cyan.bold("ulu")}${chalk.bold("·ops")} v${version} — available agents and workflows`,
    );
    console.log();
    await printAgentList();
    info(`Install with: ${chalk.cyan("npx @uluops/setup")}`);
    console.log();
    return;
  }

  if (opts.verify) {
    await runVerify();
    return;
  }

  if (opts.uninstall) {
    // --harness / --all-detected on uninstall acts as a FILTER over the
    // manifest's recorded harnesses, not a selection over what's detected
    // on disk. Pass through the raw flag values; runUninstall delegates
    // parsing + validation to resolveUninstallFilter (which mirrors the
    // install-side conflict detection).
    await runUninstall({
      dryRun: opts.dryRun,
      harnessArg: opts.harness,
      harnessFromCli: program.getOptionValueSource("harness") === "cli",
      allDetected: opts.allDetected,
    });
    return;
  }

  if (opts.scope && opts.scope !== "local" && opts.scope !== "global") {
    console.error(
      chalk.red(
        `\n  Invalid --scope "${opts.scope}". Expected "global" or "local".\n`,
      ),
    );
    process.exit(1);
  }
  const scope = opts.scope === "local" ? "local" : "global";

  // Resolve harness selection through the pure selection module so the
  // matrix of (--harness, --all-detected, detection count, TTY) lives in
  // one tested place. cli.ts only wires the prompt and emit-info callbacks.
  const detected = detectHarnesses();
  const isInteractive =
    !opts.yes &&
    !opts.apiKey &&
    !process.env["ULUOPS_API_KEY"] &&
    !!process.stdin.isTTY;

  let harnessNames: string[];
  try {
    harnessNames = await selectHarnesses({
      harnessArg: opts.harness,
      harnessFromCli: program.getOptionValueSource("harness") === "cli",
      allDetected: opts.allDetected,
      detected,
      defaultHarness: "claude-code",
      isInteractive,
      emitInfo: (msg) => info(chalk.dim(msg)),
      promptCheckbox: async (profiles: HarnessProfile[]) => {
        const { checkbox } = await import("@inquirer/prompts");
        const chosen = await checkbox({
          message:
            "Multiple harnesses detected. Which would you like to install into?",
          instructions: " (use space to toggle, enter to confirm)",
          choices: profiles.map((p) => ({
            name: p.displayName,
            value: p.name,
            checked: true,
          })),
        });
        console.log();
        return chosen;
      },
    });
  } catch (err) {
    if (err instanceof HarnessSelectionError) {
      console.error(chalk.red(`\n  ${err.message}\n`));
      process.exit(1);
    }
    throw err;
  }

  // Resolve every name through getProfile up front. This catches typos
  // (e.g. `--harness claude-cod,codex`) before any state is touched and
  // surfaces the canonical "Available: ..." error. Aliases ('claude' →
  // 'claude-code') are normalized here as a side effect.
  let resolvedHarnesses: string[];
  try {
    resolvedHarnesses = harnessNames.map((n) => getProfile(n).name);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(chalk.red(`\n  ${msg}\n`));
    process.exit(1);
  }

  await runSetup({
    apiKey: opts.apiKey,
    signup: opts.signup ?? false,
    scope,
    localDefs: opts.localDefs,
    shell: opts.shell,
    withCli: opts.withCli,
    cli: opts.cli,
    withAgentMetricsCli: opts.withAgentMetricsCli,
    agentMetricsCli: opts.agentMetricsCli,
    noMetrics: !opts.metrics,
    skipValidation: opts.skipValidation,
    dryRun: opts.dryRun,
    yes: opts.yes,
    harnesses: resolvedHarnesses,
  });
}

main().catch((err: unknown) => {
  if (err instanceof ConflictRejectedError) {
    // Single-harness path: user declined the conflict prompt. Exit 0
    // (today's UX — no error). The multi-harness orchestrator catches
    // this inside its loop and never lets it bubble to here when there
    // are siblings to install; this handler only fires when the declined
    // harness was the only target (the loop continues, finds nothing
    // installed, and... actually the loop swallows it before propagating,
    // so this handler is defense-in-depth for any future caller of
    // checkConflicts outside the loop). Either way: exit 0, no message.
    process.exit(0);
  }
  if (err instanceof HarnessNotTestedError) {
    console.error(chalk.yellow(`\n  ${err.message}\n`));
    process.exit(1);
  }
  if (err instanceof InstallLockHeldError) {
    console.error(chalk.yellow(`\n  ${err.message}\n`));
    console.error(
      chalk.dim(
        "  Wait for the other process to finish, or — if it crashed —\n" +
          "  the lock auto-releases after 30 minutes or when the held\n" +
          "  PID is detected as no longer running.\n",
      ),
    );
    process.exit(1);
  }
  const msg = err instanceof Error ? err.message : String(err);
  console.error(chalk.red(`\n  Error: ${msg}\n`));
  process.exit(1);
});
