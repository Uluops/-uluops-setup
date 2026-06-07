import chalk from "chalk";
import { getAgentCommands, getWorkflowCommands } from "./asset-catalog.js";
import type { PerHarnessResult } from "../commands/per-harness.js";

const ok = (msg: string) => console.log(`  ${chalk.green("✓")} ${msg}`);
const warn = (msg: string) => console.log(`  ${chalk.yellow("⚠")} ${msg}`);
const fail = (msg: string) => console.log(`  ${chalk.red("✗")} ${msg}`);
const info = (msg: string) => console.log(`  ${msg}`);

export { ok, warn, fail, info };

const DIVIDER = `  ${chalk.dim("━".repeat(46))}`;

/**
 * Render the final post-run summary.
 *
 * Single-harness: preserves today's banner format (Setup complete!
 * + agent list + restart instruction) — regression baseline.
 *
 * Multi-harness: aggregate header line, per-harness section block with
 * status icons + counts + re-run hints, single API-key reminder, single
 * restart instruction naming each successfully-installed harness.
 *
 * Status rendering:
 *   ok       — ✓ green     installed (counts)
 *   ok+files-failed — same line, the per-step warn()s already surfaced
 *                     the failed files during install (not re-printed)
 *   failed (partial) — ⚠ yellow  partial — failed at "<step>"; re-run hint
 *   failed (pre-MCP)— ✗ red     failed — <error>; re-run hint
 *   declined — ⊘ dim       skipped — user declined conflict prompt
 */
export async function printSetupSummary(input: {
  results: PerHarnessResult[];
  apiKey: string;
}): Promise<void> {
  const { results, apiKey } = input;

  if (results.length === 0) {
    // runSetup's empty-list branch already printed "nothing to install"
    // and returned; this is defense-in-depth so the summary never crashes
    // on an empty input.
    return;
  }

  console.log();
  console.log(DIVIDER);
  console.log();

  const installed = results.filter((r) => r.status === "ok").length;
  const failed = results.filter((r) => r.status === "failed").length;
  const declined = results.filter((r) => r.status === "declined").length;
  const total = results.length;

  // Header
  if (total === 1) {
    const only = results[0]!;
    if (only.status === "ok") {
      console.log(
        `  ${chalk.bold("Setup complete!")} ${chalk.dim(`(${only.profile.displayName})`)} ${renderCounts(only)}`,
      );
    } else if (only.status === "declined") {
      console.log(
        `  ${chalk.bold("Setup skipped")} ${chalk.dim(`(${only.profile.displayName})`)} — you declined the conflict prompt`,
      );
    } else {
      console.log(
        `  ${chalk.red.bold("Setup failed")} ${chalk.dim(`(${only.profile.displayName})`)} — ${only.error ?? "see output above"}`,
      );
    }
  } else {
    const summaryParts = [`${installed} installed`];
    if (failed > 0) summaryParts.push(`${failed} failed`);
    if (declined > 0) summaryParts.push(`${declined} declined`);
    const allOk = failed === 0 && declined === 0;
    const headerLabel = allOk ? "Setup complete:" : "Setup finished:";
    console.log(
      `  ${chalk.bold(headerLabel)} ${summaryParts.join(", ")} of ${total} harnesses`,
    );
    console.log();
    for (const r of results) {
      printHarnessLine(r);
    }
  }
  console.log();

  // Agent list — only for single-harness claude-code success (the bulk of
  // single-harness installs). Multi-harness summaries omit it: it's long
  // and per-claude-code, and the multi-harness reader is more interested
  // in the per-harness status block than the agent catalog.
  if (
    total === 1 &&
    results[0]!.status === "ok" &&
    results[0]!.profile.name === "claude-code"
  ) {
    await printAgentList();
  }

  // API-key reminder — once per run regardless of harness count.
  const masked = maskKey(apiKey);
  info("For SDK/CLI usage, add to your shell profile:");
  info(`  ${chalk.cyan(`export ULUOPS_API_KEY="${masked}"`)}`);
  console.log();
  info(`Run again to update: ${chalk.cyan("npx @uluops/setup")}`);
  console.log();

  console.log(DIVIDER);
  console.log();

  // Restart instruction — names each successfully-installed harness so
  // the user knows what to restart. Suppressed entirely when nothing
  // installed (all declined / all failed pre-MCP) — there's nothing to
  // restart.
  const restartTargets = results.filter((r) => r.status === "ok");
  if (restartTargets.length > 0) {
    const names = restartTargets.map((r) => r.profile.displayName).join(", ");
    const verb = restartTargets.length === 1 ? "Restart" : "Restart each of";
    console.log(`  ${chalk.yellow.bold(`${verb} ${names} to load agents.`)}`);
    console.log();
  }
}

function printHarnessLine(r: PerHarnessResult): void {
  const label = chalk.bold(`[${r.profile.displayName}]`);
  switch (r.status) {
    case "ok": {
      const counts = renderCounts(r);
      console.log(`  ${chalk.green("✓")} ${label} installed ${counts}`);
      return;
    }
    case "failed": {
      if (r.partial) {
        console.log(
          `  ${chalk.yellow("⚠")} ${label} partial — failed at "${r.partial}"${r.error ? `: ${r.error}` : ""}`,
        );
      } else {
        console.log(
          `  ${chalk.red("✗")} ${label} failed — ${r.error ?? "see output above"}`,
        );
      }
      console.log(
        `     ${chalk.dim(`Re-run: npx @uluops/setup --harness ${r.harnessName}`)}`,
      );
      return;
    }
    case "declined":
      console.log(
        `  ${chalk.dim("⊘")} ${label} skipped — user declined conflict prompt`,
      );
      return;
  }
}

function renderCounts(r: PerHarnessResult): string {
  const parts: string[] = [];
  const agents = r.agentsResult?.files.length ?? 0;
  const commands = r.commandsResult?.files.length ?? 0;
  const skills = r.skillsResult?.files.length ?? 0;
  if (agents > 0) parts.push(`${agents} agents`);
  if (commands > 0) parts.push(`${commands} commands`);
  if (skills > 0) parts.push(`${skills} skills`);
  if (r.metricsResult?.hookConfigured) parts.push("metrics");
  return parts.length > 0 ? `(${parts.join(" · ")})` : "";
}

export function maskKey(key: string): string {
  if (!key || key.length <= 4) return "****";
  const last4 = key.slice(-4);
  return `${"*".repeat(Math.max(4, key.length - 4))}${last4}`;
}

export async function printAgentList(): Promise<void> {
  const workflows = await getWorkflowCommands();
  const agents = await getAgentCommands();

  if (workflows.length > 0) {
    info(chalk.bold("WORKFLOWS"));
    for (const wf of workflows) {
      const cmd = `/workflows:${wf.name}`;
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
