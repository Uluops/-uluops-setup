#!/usr/bin/env node

import { Command } from "commander";
import chalk from "chalk";

import { info, printAgentList } from "./lib/display.js";
import { getVersion } from "./lib/version.js";
import {
  resolveHarnessName,
  listHarnesses,
  HarnessNotTestedError,
} from "./harnesses/index.js";
import { runSetup } from "./commands/setup.js";
import { runUninstall } from "./commands/uninstall.js";
import { runVerify } from "./commands/verify.js";

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
      `Target harness: ${listHarnesses().join(", ")} (aliases: claude, oc, gemini)`,
      "claude-code",
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
    scope: string;
    localDefs: boolean;
    shell: boolean;
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
    await runUninstall({ dryRun: opts.dryRun });
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

  // Resolve harness name (supports aliases)
  const harnessName = resolveHarnessName(opts.harness);

  await runSetup({
    apiKey: opts.apiKey,
    signup: opts.signup ?? false,
    scope,
    localDefs: opts.localDefs,
    shell: opts.shell,
    skipValidation: opts.skipValidation,
    dryRun: opts.dryRun,
    yes: opts.yes,
    harness: harnessName,
  });
}

main().catch((err: unknown) => {
  if (err instanceof HarnessNotTestedError) {
    console.error(chalk.yellow(`\n  ${err.message}\n`));
    process.exit(1);
  }
  const msg = err instanceof Error ? err.message : String(err);
  console.error(chalk.red(`\n  Error: ${msg}\n`));
  process.exit(1);
});
