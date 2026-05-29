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
  initContext,
  checkConflicts,
  configureMcpStep,
  installAgentsDefs,
  installCommandsDefs,
  configureMetricsStep,
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

    await saveManifest(manifest);
  }

  await printSetupSummary({
    profile,
    agentCount: agentsResult.files.length,
    commandCount: commandsResult.files.length,
    apiKey,
  });
}
