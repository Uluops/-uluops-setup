import chalk from "chalk";
import { getAgentCommands, getWorkflowCommands } from "./asset-catalog.js";
import type { HarnessProfile } from "../harnesses/index.js";

const ok = (msg: string) => console.log(`  ${chalk.green("✓")} ${msg}`);
const warn = (msg: string) => console.log(`  ${chalk.yellow("⚠")} ${msg}`);
const fail = (msg: string) => console.log(`  ${chalk.red("✗")} ${msg}`);
const info = (msg: string) => console.log(`  ${msg}`);

export { ok, warn, fail, info };

export async function printSetupSummary(opts: {
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
