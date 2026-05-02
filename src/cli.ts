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
import type { HarnessManifest } from "./lib/manifest.js";
import { ASSETS_DIR, findProjectRoot } from "./lib/paths.js";
import { getHealthTimeout } from "./lib/health.js";
import { getAgentCommands, getWorkflowCommands } from "./lib/asset-catalog.js";
import {
  getProfile,
  resolveHarnessName,
  listHarnesses,
  HarnessNotTestedError,
} from "./harnesses/index.js";
import type { HarnessProfile } from "./harnesses/index.js";

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
  harness: string;
}): Promise<void> {
  const version = await getVersion();
  const profile = getProfile(opts.harness);

  console.log();
  console.log(
    `  ${chalk.dim("⟨u⟩")} ${chalk.cyan.bold("ulu")}${chalk.bold("·ops")}`,
  );
  console.log(
    `      ${chalk.dim("operating intelligence as infrastructure")}`,
  );
  console.log();
  console.log(`  Setup v${version} — ${chalk.bold(profile.displayName)}`);
  console.log();

  if (opts.dryRun) {
    info(chalk.dim("(dry run — no changes will be made)\n"));
  }

  const { env, apiKey } = await initContext(opts);
  console.log();

  // Load existing manifest for update detection
  const existingManifest = await loadManifest();
  const existingHarness = existingManifest?.harnesses[profile.name];

  if (existingManifest && existingManifest.version !== version) {
    info(
      `Updating ${chalk.dim(existingManifest.version)} → ${chalk.green(version)}`,
    );
    console.log();
  } else if (existingHarness) {
    info(chalk.dim(`Already at v${version} — checking for changes`));
    console.log();
  }

  // Check for conflicts on first install for this harness
  if (!existingHarness && !opts.yes && !opts.dryRun) {
    await checkConflicts(profile, opts.localDefs);
  }

  const mcpResult = await configureMcpStep(profile, apiKey, opts);

  const agentsResult = await installAgentsDefs(
    profile,
    opts,
    existingHarness?.agents,
  );

  const commandsResult = await installCommandsDefs(
    profile,
    opts,
    existingHarness?.commands,
  );

  const metricsResult = await configureMetricsStep(profile, opts);

  await runHealthCheck(opts);

  const shellModified = await configureShell(env, apiKey, opts);

  // Save manifest
  if (!opts.dryRun) {
    const now = new Date().toISOString();
    const harnessEntry: HarnessManifest = {
      installedAt: now,
      setupVersion: version,
      mcpScope: opts.scope,
      mcpConfigPath: mcpResult.configPath,
      defsScope: opts.localDefs ? "local" : "global",
      defsPath: opts.localDefs
        ? join(await findProjectRoot(), "uluops")
        : profile.paths.home,
      agents: agentsResult.files,
      commands: commandsResult.files,
      hooksInstalled: metricsResult.hookConfigured,
    };

    const manifest = existingManifest ?? {
      version,
      installedAt: now,
      shellModified: false,
      harnesses: {},
    };
    manifest.version = version;
    manifest.installedAt = now;
    manifest.shellModified = shellModified || manifest.shellModified;
    manifest.harnesses[profile.name] = harnessEntry;

    await saveManifest(manifest);
  }

  await printSetupSummary({
    profile,
    agentCount: agentsResult.files.length,
    commandCount: commandsResult.files.length,
    apiKey,
  });
}

// --- extracted helpers ---

async function initContext(opts: {
  apiKey?: string;
  signup: boolean;
  skipValidation: boolean;
  yes: boolean;
}) {
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
        interactive:
          !opts.yes && !opts.apiKey && !process.env["ULUOPS_API_KEY"],
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

async function configureMcpStep(
  profile: HarnessProfile,
  apiKey: string,
  opts: { scope: "global" | "local"; dryRun: boolean },
) {
  const res = await installMcp(profile, apiKey, opts.scope, opts.dryRun);
  ok(`MCP config → ${res.configPath} (2 servers)`);
  for (const w of res.packageWarnings) warn(w);
  return res;
}

async function installAgentsDefs(
  profile: HarnessProfile,
  opts: { localDefs: boolean; dryRun: boolean },
  prev?: string[],
) {
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
  return res;
}

async function installCommandsDefs(
  profile: HarnessProfile,
  opts: { localDefs: boolean; dryRun: boolean },
  prev?: string[],
) {
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
  const total = res.agentCommands + res.workflowCommands;
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
  return res;
}

async function configureMetricsStep(
  profile: HarnessProfile,
  opts: { dryRun: boolean },
) {
  if (!profile.hooks) {
    info(
      chalk.dim(
        `Metrics hooks not supported for ${profile.displayName}`,
      ),
    );
    return { toolFilesCopied: 0, hookConfigured: false };
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

async function runHealthCheck(opts: {
  skipValidation: boolean;
  dryRun: boolean;
}) {
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

async function configureShell(
  env: { shellProfile: string | null },
  apiKey: string,
  opts: { shell: boolean; yes: boolean; dryRun: boolean },
) {
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

async function confirmShellWrite(profilePath: string): Promise<boolean> {
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

async function printSetupSummary(opts: {
  profile: HarnessProfile;
  agentCount: number;
  commandCount: number;
  apiKey: string;
}): Promise<void> {
  console.log();
  console.log(`  ${chalk.dim("━".repeat(46))}`);
  console.log();

  const parts = [`${opts.agentCount} agents`];
  if (opts.commandCount > 0) parts.push(`${opts.commandCount} slash commands`);
  if (opts.profile.hooks) parts.push("metrics");
  console.log(
    `  ${chalk.bold("Setup complete!")} ${chalk.dim(`(${opts.profile.displayName})`)} ${parts.join(" · ")}`,
  );
  console.log();

  if (opts.profile.name === "claude-code") {
    await printAgentList();
  }

  const masked = maskKey(opts.apiKey);
  info("For SDK/CLI usage, add to your shell profile:");
  info(`  ${chalk.cyan(`export ULUOPS_API_KEY="${masked}"`)}`);
  console.log();
  info(`Run again to update: ${chalk.cyan("npx @uluops/setup")}`);
  console.log();

  console.log(`  ${chalk.dim("━".repeat(46))}`);
  console.log();
  console.log(
    `  ${chalk.yellow.bold(`Restart ${opts.profile.displayName} to load agents.`)}`,
  );
  console.log();
}

function maskKey(key: string): string {
  if (!key || key.length <= 4) return "****";
  const last4 = key.slice(-4);
  return `${"*".repeat(Math.max(4, key.length - 4))}${last4}`;
}

async function printAgentList(): Promise<void> {
  const workflows = await getWorkflowCommands();
  const agents = await getAgentCommands();

  if (workflows.length > 0) {
    info(chalk.bold("WORKFLOWS"));
    for (const wf of workflows) {
      const cmd = `/workflows:${wf.name}`;
      // Truncate description to fit display
      const desc = wf.description.length > 40
        ? wf.description.slice(0, 37) + "..."
        : wf.description;
      info(`  ${chalk.cyan(cmd.padEnd(34))}${desc}`);
    }
    console.log();
  }

  if (agents.length > 0) {
    info(
      `${chalk.bold("AGENTS")} (run individually)${" ".repeat(26)}${chalk.dim("MODEL")}`,
    );
    for (const agent of agents) {
      const cmd = `/agents:${agent.name}`;
      // Truncate description to fit display
      const desc = agent.description.length > 17
        ? agent.description.slice(0, 14) + "..."
        : agent.description;
      info(
        `  ${chalk.cyan(cmd.padEnd(34))}${desc.padEnd(17)}${chalk.dim(agent.model)}`,
      );
    }
    console.log();
  }

  info(
    chalk.dim(
      `  This is the starter set. Browse more agents at registry.uluops.ai`,
    ),
  );
  console.log();
}

async function runUninstall(opts: { dryRun: boolean }): Promise<void> {
  const version = await getVersion();
  console.log();
  console.log(
    `  ${chalk.dim("⟨u⟩")} ${chalk.cyan.bold("ulu")}${chalk.bold("·ops")} ${chalk.red("Uninstall")} v${version}`,
  );
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

  for (const [harnessName, hm] of Object.entries(manifest.harnesses)) {
    let profile: HarnessProfile;
    try {
      profile = getProfile(harnessName);
    } catch {
      warn(`Unknown harness "${harnessName}" in manifest — skipping`);
      continue;
    }

    info(chalk.bold(profile.displayName));

    if (!opts.dryRun) {
      const agentCount = await uninstallAgents(hm.agents, hm.defsPath);
      ok(`Removed ${agentCount} agent(s)`);
    } else {
      ok(`Would remove ${hm.agents.length} agent(s)`);
    }

    if (hm.commands.length > 0) {
      if (!opts.dryRun) {
        const cmdCount = await uninstallCommands(hm.commands, hm.defsPath);
        ok(`Removed ${cmdCount} command(s)`);
      } else {
        ok(`Would remove ${hm.commands.length} command(s)`);
      }
    }

    if (!opts.dryRun) {
      try {
        await uninstallMcp(profile, hm.mcpConfigPath);
        ok(`Removed MCP servers from ${hm.mcpConfigPath}`);
      } catch {
        warn(`Could not remove MCP servers from ${hm.mcpConfigPath}`);
      }
    } else {
      ok(`Would remove MCP servers from ${hm.mcpConfigPath}`);
    }

    if (hm.hooksInstalled) {
      if (!opts.dryRun) {
        await uninstallMetrics(profile, false);
        ok("Removed agent-metrics hook and tool files");
      } else {
        ok("Would remove agent-metrics hook and tool files");
      }
    }

    console.log();
  }

  // Remove shell export
  if (manifest.shellModified) {
    const { getShellProfile } = await import("./lib/paths.js");
    const shellProfile = getShellProfile();
    if (shellProfile && !opts.dryRun) {
      await removeShellExport(shellProfile.path);
      ok(`Removed export from ${shellProfile.path}`);
    } else if (shellProfile) {
      ok(`Would remove export from ${shellProfile.path}`);
    }
  }

  if (!opts.dryRun) {
    await deleteManifest();
    ok("Manifest deleted");
  }

  console.log();
  info("UluOps has been removed. Restart your harness to complete.");
  console.log();
}

async function runVerify(): Promise<void> {
  const version = await getVersion();
  console.log();
  console.log(
    `  ${chalk.dim("⟨u⟩")} ${chalk.cyan.bold("ulu")}${chalk.bold("·ops")} Installation Check v${version}`,
  );
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

async function checkConflicts(
  profile: HarnessProfile,
  localDefs: boolean,
): Promise<void> {
  const destDir = localDefs
    ? join(await findProjectRoot(), "uluops", "agents")
    : profile.paths.agentsDir;
  const srcDir = join(ASSETS_DIR, "agents", profile.name);

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
    process.exit(0);
  }
}

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
      'MCP config scope: "global" or "local"',
      "global",
    )
    .option(
      "--local-defs",
      "Save agents/commands locally instead of harness global dir",
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
