import chalk from "chalk";
import {
  loadManifest,
  saveManifest,
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
import { uninstallSkills } from "../steps/skills.js";
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
import {
  resolveUninstallFilter,
  UninstallFilterError,
} from "./uninstall-filter.js";

export interface RunUninstallOpts {
  dryRun: boolean;
  /**
   * Value of --harness (may be 'all', comma-split list, or a single name).
   * Undefined when --harness wasn't passed.
   */
  harnessArg?: string;
  /** Whether --harness was explicitly passed (vs. its commander default). */
  harnessFromCli?: boolean;
  /** Whether --all-detected was passed. */
  allDetected?: boolean;
}

export async function runUninstall(opts: RunUninstallOpts): Promise<void> {
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

    // Resolve the subset of harnesses to uninstall. `null` means "all
    // harnesses in the manifest" (today's no-filter behavior). String[]
    // means "only these — leave the rest of the manifest intact".
    const manifestHarnesses = Object.keys(manifest.harnesses);
    let filter: string[] | null;
    try {
      filter = resolveUninstallFilter({
        harnessArg: opts.harnessArg,
        harnessFromCli: opts.harnessFromCli ?? false,
        allDetected: opts.allDetected ?? false,
        manifestHarnesses,
      });
    } catch (err) {
      if (err instanceof UninstallFilterError) {
        fail(err.message);
        console.log();
        process.exit(1);
      }
      throw err;
    }

    const toUninstall = filter ?? manifestHarnesses;
    const isFullUninstall = toUninstall.length === manifestHarnesses.length;

    if (!isFullUninstall) {
      info(
        chalk.dim(
          `Uninstalling subset (${toUninstall.length} of ${manifestHarnesses.length}): ${toUninstall.join(", ")}`,
        ),
      );
      console.log();
    }

    for (const harnessName of toUninstall) {
      const hm = manifest.harnesses[harnessName];
      if (!hm) {
        // Defense — filter already validated, but keep the guard so a
        // mid-run manifest mutation doesn't crash.
        continue;
      }

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

      if ((hm.skills?.length ?? 0) > 0) {
        if (!opts.dryRun) {
          const skillCount = await uninstallSkills(hm.skills ?? [], hm.defsPath);
          ok(`Removed ${skillCount} skill file(s)`);
        } else {
          ok(`Would remove ${hm.skills?.length ?? 0} skill file(s)`);
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

    // Globals (CLI, agent-metrics CLI, shell export) are only removed on
    // a FULL uninstall — they're shared infrastructure that may serve
    // remaining harnesses or other tools after a subset uninstall.
    if (isFullUninstall) {
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
    } else {
      info(
        chalk.dim(
          `Preserving global @uluops/cli, @uluops/agent-metrics, and shell export — subset uninstall does not touch shared infrastructure`,
        ),
      );
      console.log();
    }

    // Manifest update / delete logic:
    //   full uninstall → delete the manifest entirely (today's behavior)
    //   subset uninstall, entries remain → save the trimmed manifest
    //   subset uninstall, no entries remain → delete (manifest loader
    //     would reject an empty-harnesses file)
    if (!opts.dryRun) {
      if (isFullUninstall) {
        await deleteManifest();
        ok("Manifest deleted");
      } else {
        for (const name of toUninstall) {
          delete manifest.harnesses[name];
        }
        const remaining = Object.keys(manifest.harnesses).length;
        if (remaining > 0) {
          await saveManifest(manifest);
          ok(
            `Manifest updated — ${remaining} harness(es) remain: ${Object.keys(manifest.harnesses).join(", ")}`,
          );
        } else {
          await deleteManifest();
          ok("Manifest deleted (no harnesses remain)");
        }
      }
    }

    console.log();
    if (isFullUninstall) {
      info("UluOps has been removed. Restart your harness to complete.");
    } else {
      const removed = toUninstall.join(", ");
      info(`Removed UluOps from ${removed}. Restart the affected harness(es) to complete.`);
    }
    console.log();
  } finally {
    if (lock) await lock.release();
  }
}
