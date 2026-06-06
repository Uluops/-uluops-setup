import chalk from "chalk";
import {
  loadManifest,
  deleteManifest,
  validateManifest,
} from "../lib/manifest.js";
import {
  acquireInstallLock,
  type LockHandle,
} from "../lib/install-lock.js";
import { uninstallMcp } from "../steps/mcp.js";
import { uninstallAgents } from "../steps/agents.js";
import { uninstallCommands } from "../steps/commands.js";
import { removeShellExport } from "../steps/shell.js";
import { uninstallMetrics } from "../steps/metrics.js";
import { uninstallCli, CLI_PACKAGE } from "../steps/cli.js";
import {
  uninstallAgentMetricsCli,
  AGENT_METRICS_PACKAGE,
} from "../steps/agent-metrics-cli.js";
import { ok, warn, fail, info } from "../lib/display.js";
import { getVersion } from "../lib/version.js";
import { getProfile } from "../harnesses/index.js";
import type { HarnessProfile } from "../harnesses/index.js";

export async function runUninstall(opts: { dryRun: boolean }): Promise<void> {
  const version = await getVersion();
  console.log();
  console.log(
    `  ${chalk.dim("⟨u⟩")} ${chalk.cyan.bold("ulu")}${chalk.bold("·ops")} ${chalk.red("Uninstall")} v${version}`,
  );
  console.log();

  if (opts.dryRun) {
    info(chalk.dim("(dry run — no changes will be made)\n"));
  }

  // Same lock as runSetup — concurrent setup+uninstall would race the same
  // shared state. Skipped on dry-run (read-only).
  let lock: LockHandle | null = null;
  if (!opts.dryRun) {
    lock = await acquireInstallLock();
  }

  try {

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

  // Remove global @uluops/cli if WE installed it (per manifest).
  // We never auto-remove a user-installed CLI — manifest.cliInstalled gates this.
  if (manifest.cliInstalled) {
    const res = await uninstallCli({ dryRun: opts.dryRun });
    if (opts.dryRun) {
      ok(`Would remove ${CLI_PACKAGE} (global)`);
    } else if (res.removed) {
      ok(`Removed ${CLI_PACKAGE} (global)`);
    } else {
      warn(
        `Could not remove ${CLI_PACKAGE} (global) — try \`npm uninstall -g ${CLI_PACKAGE}\` manually`,
      );
      if (res.error) {
        const oneLine = res.error.split("\n")[0]?.slice(0, 120) ?? "";
        if (oneLine) info(`  ${oneLine}`);
      }
    }
  }

  // Same ownership rule for the agent-metrics CLI.
  if (manifest.agentMetricsCliInstalled) {
    const res = await uninstallAgentMetricsCli({ dryRun: opts.dryRun });
    if (opts.dryRun) {
      ok(`Would remove ${AGENT_METRICS_PACKAGE} (global)`);
    } else if (res.removed) {
      ok(`Removed ${AGENT_METRICS_PACKAGE} (global)`);
    } else {
      warn(
        `Could not remove ${AGENT_METRICS_PACKAGE} (global) — try \`npm uninstall -g ${AGENT_METRICS_PACKAGE}\` manually`,
      );
      if (res.error) {
        const oneLine = res.error.split("\n")[0]?.slice(0, 120) ?? "";
        if (oneLine) info(`  ${oneLine}`);
      }
    }
  }

  // Remove shell export
  if (manifest.shellModified) {
    const { getShellProfile } = await import("../lib/paths.js");
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

  } finally {
    if (lock) await lock.release();
  }
}
