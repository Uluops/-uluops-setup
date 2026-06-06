#!/usr/bin/env node

import { Command } from "commander";
import chalk from "chalk";

import { info, printAgentList } from "./lib/display.js";
import { getVersion } from "./lib/version.js";
import {
  resolveHarnessName,
  listHarnesses,
  detectHarnesses,
  HarnessNotTestedError,
} from "./harnesses/index.js";
import { InstallLockHeldError } from "./lib/install-lock.js";
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
    .option(
      "--with-cli",
      "Install @uluops/cli globally without prompting",
    )
    .option(
      "--no-cli",
      "Skip @uluops/cli install without prompting (takes precedence over --with-cli)",
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
    scope: string;
    localDefs: boolean;
    shell: boolean;
    withCli?: boolean;
    cli: boolean;
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

  // Resolve harness: if --harness was passed explicitly, honor it as-is.
  // Otherwise auto-detect — single match wins silently, multiple matches
  // prompt the user, no matches falls back to the default (claude-code)
  // to preserve the landing-page "just run npx @uluops/setup" promise.
  const harnessExplicit = program.getOptionValueSource("harness") === "cli";
  let harnessName: string;
  if (harnessExplicit) {
    harnessName = resolveHarnessName(opts.harness);
  } else {
    const detected = detectHarnesses();
    if (detected.length === 1) {
      harnessName = detected[0]!.name;
      if (harnessName !== "claude-code") {
        info(
          chalk.dim(
            `Detected ${chalk.cyan(detected[0]!.displayName)} — using as target (pass --harness to override)`,
          ),
        );
      }
    } else if (detected.length > 1) {
      const isInteractive =
        !opts.yes && !opts.apiKey && !process.env["ULUOPS_API_KEY"] && process.stdin.isTTY;
      if (isInteractive) {
        const { select } = await import("@inquirer/prompts");
        harnessName = await select({
          message: "Multiple harnesses detected — which one are you setting up?",
          choices: detected.map((p) => ({ name: p.displayName, value: p.name })),
          default: detected[0]!.name,
        });
        console.log();
      } else {
        harnessName = detected[0]!.name;
        info(
          chalk.dim(
            `Multiple harnesses detected (${detected.map((p) => p.displayName).join(", ")}); defaulting to ${chalk.cyan(detected[0]!.displayName)} — pass --harness to choose`,
          ),
        );
      }
    } else {
      harnessName = resolveHarnessName(opts.harness);
    }
  }

  await runSetup({
    apiKey: opts.apiKey,
    signup: opts.signup ?? false,
    scope,
    localDefs: opts.localDefs,
    shell: opts.shell,
    withCli: opts.withCli,
    cli: opts.cli,
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
