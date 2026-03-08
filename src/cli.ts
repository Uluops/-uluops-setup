#!/usr/bin/env node

import { Command } from "commander";
import chalk from "chalk";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { detect } from "./steps/detect.js";
import { resolveApiKey } from "./steps/auth.js";
import { installMcp, uninstallMcp } from "./steps/mcp.js";
import { installAgents, uninstallAgents } from "./steps/agents.js";
import { installCommands, uninstallCommands } from "./steps/commands.js";
import { writeShellExport, removeShellExport } from "./steps/shell.js";
import { verify } from "./steps/verify.js";
import {
  loadManifest,
  saveManifest,
  deleteManifest,
} from "./lib/manifest.js";
import { getClaudeHome } from "./lib/paths.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function getVersion(): Promise<string> {
  const pkgPath = join(__dirname, "..", "package.json");
  const pkg = JSON.parse(await readFile(pkgPath, "utf-8")) as {
    version: string;
  };
  return pkg.version;
}

const ok = (msg: string) => console.log(`  ${chalk.green("✓")} ${msg}`);
const warn = (msg: string) => console.log(`  ${chalk.yellow("⚠")} ${msg}`);
const fail = (msg: string) => console.log(`  ${chalk.red("✗")} ${msg}`);
const info = (msg: string) => console.log(`  ${msg}`);

async function runSetup(opts: {
  apiKey?: string;
  scope: "global" | "local";
  localDefs: boolean;
  shell: boolean;
  skipValidation: boolean;
  dryRun: boolean;
  yes: boolean;
}): Promise<void> {
  const version = await getVersion();
  console.log(`\n  ${chalk.bold("UluOps Setup")} v${version}\n`);

  if (opts.dryRun) {
    info(chalk.dim("(dry run — no changes will be made)\n"));
  }

  // Detect environment
  const env = await detect();

  // Resolve API key
  let apiKey: string;
  let email: string | null = null;
  try {
    const auth = await resolveApiKey({
      apiKeyFlag: opts.apiKey,
      skipValidation: opts.skipValidation,
      interactive: !opts.apiKey && !process.env["ULUOPS_API_KEY"],
    });
    apiKey = auth.apiKey;
    email = auth.email;
    if (email) {
      ok(`Key validated (${email})`);
    } else if (opts.skipValidation) {
      ok("Key accepted (validation skipped)");
    } else {
      ok("Key validated");
    }
  } catch (err) {
    fail((err as Error).message);
    process.exit(1);
  }

  console.log();

  // Load existing manifest for update detection
  const existingManifest = await loadManifest();

  // Check for conflicts on first install
  if (!existingManifest && !opts.yes && !opts.dryRun) {
    await checkConflicts(opts.localDefs);
  }

  // MCP config
  const mcpResult = await installMcp(apiKey, opts.scope, opts.dryRun);
  ok(
    `MCP config → ${mcpResult.configPath} (2 servers)`,
  );

  // Agents
  const agentsResult = await installAgents(
    opts.localDefs,
    opts.dryRun,
    existingManifest?.agents,
  );
  const agentParts: string[] = [];
  if (agentsResult.copied > 0)
    agentParts.push(`${agentsResult.copied} copied`);
  if (agentsResult.skipped > 0)
    agentParts.push(`${agentsResult.skipped} unchanged`);
  if (agentsResult.removed > 0)
    agentParts.push(`${agentsResult.removed} removed`);
  ok(
    `${agentsResult.files.length} agents → ${opts.localDefs ? "./uluops/agents/" : "~/.claude/agents/"}${agentParts.length ? ` (${agentParts.join(", ")})` : ""}`,
  );

  // Commands
  const commandsResult = await installCommands(
    opts.localDefs,
    opts.dryRun,
    existingManifest?.commands,
  );
  const totalCommands =
    commandsResult.agentCommands + commandsResult.workflowCommands;
  const cmdSkipped = commandsResult.skipped;
  const cmdTotal = commandsResult.files.length;
  const cmdParts: string[] = [];
  if (totalCommands > 0) cmdParts.push(`${totalCommands} copied`);
  if (cmdSkipped > 0) cmdParts.push(`${cmdSkipped} unchanged`);
  if (commandsResult.removed > 0)
    cmdParts.push(`${commandsResult.removed} removed`);
  ok(
    `${cmdTotal} commands → ${opts.localDefs ? "./uluops/commands/" : "~/.claude/commands/"}${cmdParts.length ? ` (${cmdParts.join(", ")})` : ""}`,
  );

  // Health check
  if (!opts.skipValidation && !opts.dryRun) {
    try {
      const [trackerOk, registryOk] = await Promise.all([
        checkEndpoint("https://api.uluops.ai/api/v1/health"),
        checkEndpoint("https://api.uluops.ai/api/v1/registry/health"),
      ]);
      if (trackerOk && registryOk) {
        ok("Health check passed — both APIs reachable");
      } else {
        warn("Some APIs unreachable (MCP tools may have limited functionality)");
      }
    } catch {
      warn("Health check skipped (network issue)");
    }
  }

  // Shell export
  if (opts.shell && env.shellProfile) {
    await writeShellExport(env.shellProfile, apiKey, opts.dryRun);
    ok(`ULUOPS_API_KEY added to ${env.shellProfile}`);
  }

  // Save manifest
  if (!opts.dryRun) {
    await saveManifest({
      version,
      installedAt: new Date().toISOString(),
      mcpScope: opts.scope,
      mcpConfigPath: mcpResult.configPath,
      defsScope: opts.localDefs ? "local" : "global",
      defsPath: opts.localDefs
        ? join(process.cwd(), "uluops")
        : getClaudeHome(),
      shellModified: opts.shell,
      agents: agentsResult.files,
      commands: commandsResult.files,
    });
  }

  // Summary
  const toolCount = 73;
  console.log();
  console.log(
    `  ${chalk.dim("━".repeat(46))}`,
  );
  console.log();
  console.log(
    `  ${chalk.bold("Setup complete!")} ${toolCount} MCP tools · ${agentsResult.files.length} agents · ${cmdTotal} slash commands`,
  );
  console.log();
  warn("Restart Claude Code to load agents, then try:");
  console.log();
  info(`  ${chalk.cyan("/workflows:post-implementation .")}`);
  console.log();

  // Workflow/pipeline listing
  info(chalk.bold("WORKFLOWS"));
  info(
    `  ${chalk.cyan("/workflows:pre-implementation")}    Design review before coding`,
  );
  info(
    `  ${chalk.cyan("/workflows:post-implementation")}   Iterative validation loop`,
  );
  info(
    `  ${chalk.cyan("/workflows:ship")}                  Final gate before shipping`,
  );
  info(
    `  ${chalk.cyan("/workflows:prompt-audit")}          Audit agent prompts`,
  );
  console.log();
  info(chalk.bold("PIPELINES"));
  info(
    `  ${chalk.cyan("/pipelines:aristotle")}             Four-cause teleological analysis`,
  );
  console.log();

  // Agent listing
  info(`${chalk.bold("AGENTS")} (run individually)${" ".repeat(26)}${chalk.dim("MODEL")}`);
  const agentList: [string, string, string][] = [
    ["/agents:validate", "Code quality", "sonnet"],
    ["/agents:type-safety", "TypeScript", "sonnet"],
    ["/agents:test-review", "Test quality", "sonnet"],
    ["/agents:optimize", "Performance", "sonnet"],
    ["/agents:frontend", "React/a11y", "sonnet"],
    ["/agents:mcp-validate", "MCP compliance", "sonnet"],
    ["/agents:architect", "Design review", "sonnet"],
    ["/agents:audit", "Runtime bugs", "opus"],
    ["/agents:security", "OWASP", "sonnet"],
    ["/agents:api-contract", "API alignment", "sonnet"],
    ["/agents:release", "Publish ready", "sonnet"],
    ["/agents:public-interface", "README/exports", "sonnet"],
    ["/agents:docs-validate", "Documentation", "sonnet"],
    ["/agents:prompt-validate", "Prompt review", "sonnet"],
    ["/agents:prompt-quality", "Prompt quality", "sonnet"],
    ["/agents:pattern-analyzer", "Patterns", "sonnet"],
    ["/agents:aristotle-explorer", "Categories", "opus"],
    ["/agents:aristotle-analyst", "Four causes", "opus"],
    ["/agents:aristotle-validator", "Teleology", "opus"],
    ["/agents:aristotle-forecaster", "Potentiality", "opus"],
    ["/agents:assumption-excavator", "Assumptions", "sonnet"],
  ];
  for (const [cmd, desc, model] of agentList) {
    const padCmd = cmd.padEnd(34);
    const padDesc = desc.padEnd(17);
    info(`  ${chalk.cyan(padCmd)}${padDesc}${chalk.dim(model)}`);
  }

  console.log();
  info(
    `For SDK/CLI usage, add to your shell profile:`,
  );
  info(`  ${chalk.cyan(`export ULUOPS_API_KEY="${apiKey}"`)}`);
  console.log();
  info(`Run again to update: ${chalk.cyan("npx @uluops/setup")}`);
  console.log();
}

async function runUninstall(opts: { dryRun: boolean }): Promise<void> {
  const version = await getVersion();
  console.log(`\n  ${chalk.bold("UluOps Uninstall")} v${version}\n`);

  if (opts.dryRun) {
    info(chalk.dim("(dry run — no changes will be made)\n"));
  }

  const manifest = await loadManifest();
  if (!manifest) {
    warn("No manifest found — nothing to uninstall.");
    return;
  }

  // Remove agents
  if (!opts.dryRun) {
    const removed = await uninstallAgents(manifest.agents, manifest.defsPath);
    ok(`Removed ${removed} agent(s)`);
  } else {
    ok(`Would remove ${manifest.agents.length} agent(s)`);
  }

  // Remove commands
  if (!opts.dryRun) {
    const removed = await uninstallCommands(
      manifest.commands,
      manifest.defsPath,
    );
    ok(`Removed ${removed} command(s)`);
  } else {
    ok(`Would remove ${manifest.commands.length} command(s)`);
  }

  // Remove MCP config
  if (!opts.dryRun) {
    await uninstallMcp(manifest.mcpConfigPath);
    ok(`Removed MCP servers from ${manifest.mcpConfigPath}`);
  } else {
    ok(`Would remove MCP servers from ${manifest.mcpConfigPath}`);
  }

  // Remove shell export
  if (manifest.shellModified) {
    const { getShellProfile } = await import("./lib/paths.js");
    const profile = getShellProfile();
    if (profile && !opts.dryRun) {
      await removeShellExport(profile.path);
      ok(`Removed export from ${profile.path}`);
    } else if (profile) {
      ok(`Would remove export from ${profile.path}`);
    }
  }

  // Delete manifest
  if (!opts.dryRun) {
    await deleteManifest();
    ok("Manifest deleted");
  }

  console.log();
  info("UluOps has been removed. Restart Claude Code to complete.");
  console.log();
}

async function runVerify(): Promise<void> {
  const version = await getVersion();
  console.log(`\n  ${chalk.bold("UluOps Installation Check")} v${version}\n`);

  const result = await verify();

  for (const check of result.checks) {
    if (check.passed) {
      ok(check.label);
    } else {
      fail(`${check.label}${check.detail ? ` — ${check.detail}` : ""}`);
    }
  }

  console.log();
  if (result.ok) {
    info(chalk.green("All checks passed."));
  } else {
    info(chalk.red("Some checks failed. Run npx @uluops/setup to fix."));
  }
  console.log();

  process.exit(result.ok ? 0 : 1);
}

async function checkConflicts(localDefs: boolean): Promise<void> {
  const { readdir } = await import("node:fs/promises");
  const { getAgentsDir } = await import("./lib/paths.js");
  const { ASSETS_DIR } = await import("./lib/paths.js");
  const { join } = await import("node:path");

  const destDir = getAgentsDir(localDefs);
  const srcDir = join(ASSETS_DIR, "agents");

  let existingFiles: string[];
  let assetFiles: string[];
  try {
    existingFiles = await readdir(destDir);
    assetFiles = await readdir(srcDir);
  } catch {
    return; // Directory doesn't exist yet
  }

  const conflicts = assetFiles.filter((f) => existingFiles.includes(f));
  if (conflicts.length === 0) return;

  console.log(
    warn(
      `Found ${conflicts.length} existing agents that match UluOps definitions:`,
    ) ?? "",
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
    process.exit(0);
  }
}

async function checkEndpoint(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const version = await getVersion();

  const program = new Command()
    .name("uluops-setup")
    .description("Zero-friction installer for UluOps + Claude Code")
    .version(version)
    .option("--api-key <key>", "API key (skip prompt)")
    .option(
      "--scope <mode>",
      'MCP config scope: "global" or "local"',
      "global",
    )
    .option(
      "--local-defs",
      "Save agents/commands locally instead of ~/.claude/",
      false,
    )
    .option(
      "--shell",
      "Write API key export to shell profile",
      false,
    )
    .option(
      "--skip-validation",
      "Accept API key without verifying",
      false,
    )
    .option("--verify", "Check existing installation health")
    .option("--uninstall", "Remove all UluOps artifacts")
    .option("--dry-run", "Show what would happen", false)
    .option("-y, --yes", "Skip confirmations", false);

  program.parse();
  const opts = program.opts<{
    apiKey?: string;
    scope: string;
    localDefs: boolean;
    shell: boolean;
    skipValidation: boolean;
    verify: boolean;
    uninstall: boolean;
    dryRun: boolean;
    yes: boolean;
  }>();

  if (opts.verify) {
    await runVerify();
    return;
  }

  if (opts.uninstall) {
    await runUninstall({ dryRun: opts.dryRun });
    return;
  }

  const scope = opts.scope === "local" ? "local" : "global";

  await runSetup({
    apiKey: opts.apiKey,
    scope,
    localDefs: opts.localDefs,
    shell: opts.shell,
    skipValidation: opts.skipValidation,
    dryRun: opts.dryRun,
    yes: opts.yes,
  });
}

main().catch((err: unknown) => {
  console.error(chalk.red(`\n  Error: ${(err as Error).message}\n`));
  process.exit(1);
});
