#!/usr/bin/env node

import { Command } from "commander";
import chalk from "chalk";
import { readFile, readdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { detect } from "./steps/detect.js";
import { resolveApiKey } from "./steps/auth.js";
import { signup } from "./steps/signup.js";
import { installMcp, uninstallMcp } from "./steps/mcp.js";
import { installAgents, uninstallAgents } from "./steps/agents.js";
import { installCommands, uninstallCommands } from "./steps/commands.js";
import { writeShellExport, removeShellExport } from "./steps/shell.js";
import { verify } from "./steps/verify.js";
import { installMetrics, uninstallMetrics } from "./steps/metrics.js";
import { probeHookSupport } from "./lib/settings-merger.js";
import {
  loadManifest,
  saveManifest,
  deleteManifest,
  validateManifest,
} from "./lib/manifest.js";
import { getClaudeHome, getAgentsDir, ASSETS_DIR, probeClaudePaths } from "./lib/paths.js";

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
  signup: boolean;
  scope: "global" | "local";
  localDefs: boolean;
  shell: boolean;
  skipValidation: boolean;
  dryRun: boolean;
  yes: boolean;
}): Promise<void> {
  const version = await getVersion();
  console.log();
  console.log(`  ${chalk.dim("⟨u⟩")} ${chalk.cyan.bold("ulu")}${chalk.bold("·ops")}`);
  console.log(`      ${chalk.dim("operating intelligence as infrastructure")}`);
  console.log();
  console.log(`  Setup v${version}`)
  console.log();

  if (opts.dryRun) {
    info(chalk.dim("(dry run — no changes will be made)\n"));
  }

  const { env, apiKey } = await initContext(opts);
  console.log();

  if (!opts.localDefs) {
    const probe = await probeClaudePaths();
    for (const w of probe.warnings) warn(w);
    if (!probe.homeDirExists && !probe.jsonFileExists) {
      warn("Claude Code config not detected. Install may not take effect until Claude Code is configured.");
    }
    if (probe.warnings.length > 0) console.log();
  }

  // Load existing manifest for update detection
  const existingManifest = await loadManifest();

  // Show update info if re-running with newer version
  if (existingManifest && existingManifest.version !== version) {
    info(`Updating ${chalk.dim(existingManifest.version)} → ${chalk.green(version)}`);
    console.log();
  } else if (existingManifest) {
    info(chalk.dim(`Already at v${version} — checking for changes`));
    console.log();
  }

  // Check for conflicts on first install
  if (!existingManifest && !opts.yes && !opts.dryRun) {
    await checkConflicts(opts.localDefs);
  }

  const mcpResult = await configureMcp(apiKey, opts);

  const agentsResult = await installDefs("agents", opts, existingManifest?.agents);

  const commandsResult = await installDefs("commands", opts, existingManifest?.commands);
  const cmdTotal = commandsResult.files.length;

  const metricsResult = await configureMetrics(opts);

  await runHealthCheck(opts);

  const shellModified = await configureShell(env, apiKey, opts);

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
      shellModified,
      agents: agentsResult.files,
      commands: commandsResult.files,
      metricsHookInstalled: metricsResult.hookConfigured,
    });
  }

  printSetupSummary({
    agentCount: agentsResult.files.length,
    commandCount: cmdTotal,
    apiKey,
  });
}

// --- extracted helpers ---

async function initContext(opts: any) {
  const env = await detect();
  let apiKey: string;
  try {
    if (opts.signup) {
      info("Create your UluOps account\n");
      const auth = await signup();
      apiKey = auth.apiKey;
      ok(`Account created (${auth.email})`);
      ok(`API key generated`);
    } else {
      const auth = await resolveApiKey({
        apiKeyFlag: opts.apiKey,
        skipValidation: opts.skipValidation,
        interactive: !opts.yes && !opts.apiKey && !process.env["ULUOPS_API_KEY"],
      });
      apiKey = auth.apiKey;
      if (auth.email) ok(`Key validated (${auth.email})`);
      else if (opts.skipValidation) ok("Key accepted (validation skipped)");
      else ok("Key validated");
    }
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
  return { env, apiKey };
}

async function configureMcp(apiKey: string, opts: any) {
  const res = await installMcp(apiKey, opts.scope, opts.dryRun);
  ok(`MCP config → ${res.configPath} (2 servers)`);
  for (const w of res.packageWarnings) warn(w);
  return res;
}

async function installDefs(kind: "agents" | "commands", opts: any, prev?: any) {
  if (kind === "agents") {
    const res = await installAgents(opts.localDefs, opts.dryRun, prev);
    const parts: string[] = [];
    if (res.copied > 0) parts.push(`${res.copied} copied`);
    if (res.skipped > 0) parts.push(`${res.skipped} unchanged`);
    if (res.removed > 0) parts.push(`${res.removed} removed`);
    ok(`${res.files.length} agents → ${opts.localDefs ? "./uluops/agents/" : "~/.claude/agents/"}${parts.length ? ` (${parts.join(", ")})` : ""}`);
    return res;
  }
  const res = await installCommands(opts.localDefs, opts.dryRun, prev);
  const total = res.agentCommands + res.workflowCommands;
  const parts: string[] = [];
  if (total > 0) parts.push(`${total} copied`);
  if (res.skipped > 0) parts.push(`${res.skipped} unchanged`);
  if (res.removed > 0) parts.push(`${res.removed} removed`);
  ok(`${res.files.length} commands → ${opts.localDefs ? "./uluops/commands/" : "~/.claude/commands/"}${parts.length ? ` (${parts.join(", ")})` : ""}`);
  return res;
}

async function configureMetrics(opts: any) {
  const probe = probeHookSupport();
  if (probe.warning) warn(probe.warning);

  const res = await installMetrics(opts.dryRun);
  if (res.hookConfigured) {
    const parts: string[] = [];
    if (res.toolFilesCopied > 0) parts.push(`${res.toolFilesCopied} files`);
    parts.push("hook configured");
    ok(`Agent metrics → ~/.claude/tools/agent-metrics/ (${parts.join(", ")})`);
  } else {
    warn("Agent metrics hook not configured (tool files not found)");
  }
  return res;
}

async function runHealthCheck(opts: any) {
  if (!opts.skipValidation && !opts.dryRun) {
    try {
      const [trackerOk, registryOk] = await Promise.all([
        checkEndpoint("https://api.uluops.ai/api/v1/health"),
        checkEndpoint("https://api.uluops.ai/api/v1/registry/health"),
      ]);
      if (trackerOk && registryOk) ok("Health check passed — both APIs reachable");
      else warn("Some APIs unreachable (MCP tools may have limited functionality)");
    } catch {
      warn("Health check skipped (network issue)");
    }
  }
}

async function configureShell(env: any, apiKey: string, opts: any) {
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
    warn("API key stored in plaintext in shell profile. Consider rotating if shared machine.");
    modified = true;
  } else if (opts.shell) {
    warn("--shell requested but no supported shell detected ($SHELL). Skipping.");
  }
  return modified;
}

async function confirmShellWrite(profilePath: string): Promise<boolean> {
  const readline = await import("node:readline/promises");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`Write ULUOPS_API_KEY to ${profilePath}? (y/N) `);
  rl.close();
  return answer.trim().toLowerCase() === "y";
}

// MCP tool count across both servers. Update when server toolsets change.
const TOOL_COUNT = 73;

const AGENT_LIST: [string, string, string][] = [
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
  ["/agents:workflow-synthesis", "Cross-agent synthesis", "opus"],
];

function printSetupSummary(opts: {
  agentCount: number;
  commandCount: number;
  apiKey: string;
}): void {
  console.log();
  console.log(`  ${chalk.dim("━".repeat(46))}`);
  console.log();
  console.log(
    `  ${chalk.bold("Setup complete!")} ${TOOL_COUNT} MCP tools · ${opts.agentCount} agents · ${opts.commandCount} slash commands · metrics`,
  );
  console.log();

  printAgentList();

  const masked = maskKey(opts.apiKey);
  info("For SDK/CLI usage, add to your shell profile:");
  info(`  ${chalk.cyan(`export ULUOPS_API_KEY="${masked}"`)}`);
  console.log();
  info(`Run again to update: ${chalk.cyan("npx @uluops/setup")}`);
  console.log();

  // Restart warning — last and prominent
  console.log(`  ${chalk.dim("━".repeat(46))}`);
  console.log();
  console.log(`  ${chalk.yellow.bold("Restart Claude Code to load agents.")}`);
  console.log();
  info("After restart, verify with:");
  info(`  ${chalk.cyan("/agents:validate --help")}`);
  console.log();
  info("Then try:");
  info(`  ${chalk.cyan("/workflows:post-implementation .")}`);
  console.log();
}

function maskKey(key: string): string {
  if (!key || key.length <= 4) return "****";
  const last4 = key.slice(-4);
  return `${"*".repeat(Math.max(4, key.length - 4))}${last4}`;
}

function printAgentList(): void {
  info(chalk.bold("WORKFLOWS"));
  info(`  ${chalk.cyan("/workflows:pre-implementation")}    Design review before coding`);
  info(`  ${chalk.cyan("/workflows:post-implementation")}   Iterative validation loop`);
  info(`  ${chalk.cyan("/workflows:ship")}                  Final gate before shipping`);
  info(`  ${chalk.cyan("/workflows:prompt-audit")}          Audit agent prompts`);
  console.log();
  info(`  ${chalk.cyan("/workflows:aristotle")}             Four-cause teleological analysis`);
  console.log();

  info(`${chalk.bold("AGENTS")} (run individually)${" ".repeat(26)}${chalk.dim("MODEL")}`);
  for (const [cmd, desc, model] of AGENT_LIST) {
    info(`  ${chalk.cyan(cmd.padEnd(34))}${desc.padEnd(17)}${chalk.dim(model)}`);
  }

  console.log();
  info(chalk.dim(`  This is the starter set. Browse 135+ agents at registry.uluops.ai`));
  console.log();
}

async function runUninstall(opts: { dryRun: boolean }): Promise<void> {
  const version = await getVersion();
  console.log();
  console.log(`  ${chalk.dim("⟨u⟩")} ${chalk.cyan.bold("ulu")}${chalk.bold("·ops")} ${chalk.red("Uninstall")} v${version}`);
  console.log();

  if (opts.dryRun) {
    info(chalk.dim("(dry run — no changes will be made)\n"));
  }

  const manifest = await loadManifest();
  if (!manifest) {
    warn("No manifest found — nothing to uninstall.");
    return;
  }

  const validation = await validateManifest(manifest);
  if (!validation.valid) {
    fail("Manifest references paths that no longer exist:");
    for (const err of validation.errors) info(`  ${err}`);
    console.log();
    info("Uninstall may be incomplete. Proceeding with what's available.");
    console.log();
  }
  if (validation.warnings.length > 0) {
    for (const w of validation.warnings) warn(w);
    console.log();
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

  // Remove agent metrics hook and tool files
  if (manifest.metricsHookInstalled) {
    if (!opts.dryRun) {
      await uninstallMetrics(false);
      ok("Removed agent-metrics hook and tool files");
    } else {
      ok("Would remove agent-metrics hook and tool files");
    }
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
  console.log();
  console.log(`  ${chalk.dim("⟨u⟩")} ${chalk.cyan.bold("ulu")}${chalk.bold("·ops")} Installation Check v${version}`);
  console.log();

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

  const destDir = await getAgentsDir(localDefs);
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
    process.exit(0);
  }
}

function getHealthTimeout(): number {
  const env = process.env["ULUOPS_HEALTH_TIMEOUT"];
  if (env) {
    const ms = Number(env);
    if (Number.isFinite(ms) && ms > 0) return ms;
  }
  return 10_000;
}

async function checkEndpoint(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(getHealthTimeout()) });
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
    .option("--signup", "Create a new account (email + password, no browser)")
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
    .option("--list", "Show available agents and workflows without installing")
    .option("--verify", "Check existing installation health")
    .option("--uninstall", "Remove all UluOps artifacts")
    .option("--dry-run", "Show what would happen", false)
    .option("-y, --yes", "Skip confirmations", false);

  program.parse();
  const opts = program.opts<{
    apiKey?: string;
    signup: boolean;
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
    console.log(`  ${chalk.dim("⟨u⟩")} ${chalk.cyan.bold("ulu")}${chalk.bold("·ops")} v${version} — available agents and workflows`);
    console.log();
    printAgentList();
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
      chalk.red(`\n  Invalid --scope "${opts.scope}". Expected "global" or "local".\n`),
    );
    process.exit(1);
  }
  const scope = opts.scope === "local" ? "local" : "global";

  await runSetup({
    apiKey: opts.apiKey,
    signup: opts.signup ?? false,
    scope,
    localDefs: opts.localDefs,
    shell: opts.shell,
    skipValidation: opts.skipValidation,
    dryRun: opts.dryRun,
    yes: opts.yes,
  });
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(chalk.red(`\n  Error: ${msg}\n`));
  process.exit(1);
});
