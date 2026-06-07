import chalk from "chalk";
import { join } from "node:path";
import {
  loadManifest,
  saveManifest,
} from "../lib/manifest.js";
import type { HarnessManifest } from "../lib/manifest.js";
import { findProjectRoot } from "../lib/paths.js";
import { info, printSetupSummary } from "../lib/display.js";
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

export async function runSetup(opts: {
  apiKey?: string;
  signup: boolean;
  scope: "global" | "local";
  localDefs: boolean;
  shell: boolean;
  skipValidation: boolean;
  dryRun: boolean;
  yes: boolean;
  harness: string;
  withCli?: boolean;
  cli?: boolean;
  withAgentMetricsCli?: boolean;
  agentMetricsCli?: boolean;
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

  // Acquire the install lock before touching any shared state. Skipped on
  // dry-run (read-only). The lock excludes a second concurrent `uluops-setup`
  // from racing the manifest / MCP config / shell-profile / settings.json
  // read-merge-write windows. Released in `finally` below.
  let lock: LockHandle | null = null;
  if (!opts.dryRun) {
    lock = await acquireInstallLock();
  }

  try {

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

  const skillsResult = await installSkillsDefs(
    profile,
    opts,
    existingHarness?.skills,
  );

  const metricsResult = await configureMetricsStep(profile, opts);

  const cliResult = await configureCliStep({
    withCli: opts.withCli,
    cli: opts.cli,
    yes: opts.yes,
    apiKey: opts.apiKey,
    dryRun: opts.dryRun,
  });

  // Only offer the agent-metrics CLI when the hook itself got configured —
  // the CLI's purpose is reading captures the hook produces, so without the
  // hook there's nothing for the CLI to surface.
  const agentMetricsCliResult = metricsResult.hookConfigured
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
      skills: skillsResult.files,
      hooksInstalled: metricsResult.hookConfigured,
      hooksInstalledVersion: metricsResult.hooksInstalledVersion,
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

    // Only flip cliInstalled to true when WE installed it (not when user-installed).
    // Once true, persist across re-runs so uninstall remains symmetric — until the
    // user explicitly removes it with --no-cli + uninstall, this manifest owns it.
    if (cliResult && cliResult.installed && !cliResult.alreadyPresent) {
      manifest.cliInstalled = true;
      manifest.cliInstalledVersion = cliResult.version;
    }

    // Same ownership rule for agent-metrics CLI — only manifest a global install
    // we performed ourselves.
    if (
      agentMetricsCliResult &&
      agentMetricsCliResult.installed &&
      !agentMetricsCliResult.alreadyPresent
    ) {
      manifest.agentMetricsCliInstalled = true;
      manifest.agentMetricsCliInstalledVersion = agentMetricsCliResult.version;
    }

    await saveManifest(manifest);
  }

  await printSetupSummary({
    profile,
    agentCount: agentsResult.files.length,
    commandCount: commandsResult.files.length,
    apiKey,
  });

  } finally {
    if (lock) await lock.release();
  }
}
