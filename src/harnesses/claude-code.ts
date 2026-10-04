/**
 * Claude Code Harness Profile
 *
 * Wraps existing config-merger.ts and settings-merger.ts logic
 * behind the HarnessProfile abstraction.
 */

import { join } from "node:path";
import {
  ULUOPS_SERVERS,
  type HarnessProfile,
  type McpConfigStrategy,
  type HookStrategy,
} from "./types.js";
import {
  readConfig,
  mergeUluopsMcp,
  removeUluopsMcp,
  writeConfig,
} from "../lib/config-merger.js";
import {
  readSettings,
  writeSettings,
  mergeUluopsHook,
  removeUluopsHook,
  hasUluopsHook,
  claudeManagedHookTypes,
} from "../lib/settings-merger.js";
import { getClaudeHome, getClaudeJsonPath } from "../lib/paths.js";
import { serialize } from "../lib/write-coordinator.js";

class ClaudeCodeMcpConfig implements McpConfigStrategy {
  async read(path: string): Promise<Record<string, unknown>> {
    return readConfig(path);
  }

  merge(
    config: Record<string, unknown>,
    apiKey: string,
  ): Record<string, unknown> {
    return mergeUluopsMcp(config, apiKey);
  }

  remove(config: Record<string, unknown>): Record<string, unknown> {
    return removeUluopsMcp(config);
  }

  async write(
    path: string,
    config: Record<string, unknown>,
  ): Promise<void> {
    await writeConfig(path, config);
  }

  check(config: Record<string, unknown>): boolean {
    const servers = config["mcpServers"] as
      | Record<string, unknown>
      | undefined;
    if (!servers) return false;
    return ULUOPS_SERVERS.every((name) => name in servers);
  }
}

class ClaudeCodeHooks implements HookStrategy {
  async install(
    settingsPath: string,
    hookCommand: string,
    dryRun: boolean,
  ): Promise<boolean> {
    if (dryRun) return true;
    // Serialized for uniformity with the MCP cycle — the invariant is
    // "every settings RMW is exclusive per path", not "only where files
    // collide today".
    await serialize(settingsPath, async () => {
      const settings = await readSettings(settingsPath);
      // Claude Code uses SubagentStop as the default event for auto-save, plus
      // SubagentStart for definition capture (agent-metrics 0.12.0).
      const merged = claudeManagedHookTypes().reduce(
        (acc, type) => mergeUluopsHook(acc, hookCommand, type),
        settings,
      );
      await writeSettings(settingsPath, merged);
    });
    return true;
  }

  async remove(settingsPath: string, dryRun: boolean): Promise<void> {
    if (dryRun) return;
    await serialize(settingsPath, async () => {
      const settings = await readSettings(settingsPath);
      const cleaned = claudeManagedHookTypes().reduce(
        (acc, type) => removeUluopsHook(acc, type),
        settings,
      );
      await writeSettings(settingsPath, cleaned);
    });
  }

  async check(settingsPath: string): Promise<boolean> {
    const settings = await readSettings(settingsPath);
    // Every managed event must be present: an install from before 0.14.0 has
    // SubagentStop only, and reads as needing the upgrade.
    return claudeManagedHookTypes().every((type) => hasUluopsHook(settings, type));
  }
}

const home = getClaudeHome();

export const claudeCodeProfile: HarnessProfile = {
  name: "claude-code",
  displayName: "Claude Code",
  status: "stable",
  homeDir: home,
  agentFormat: "markdown",
  factoryTarget: "claude-code",
  agentExtension: ".md",
  paths: {
    home,
    globalMcpConfig: getClaudeJsonPath(),
    localMcpConfig: ".mcp.json",
    agentsDir: join(home, "agents"),
    commandsDir: join(home, "commands"),
    settingsPath: join(home, "settings.json"),
    toolsDir: join(home, "tools", "agent-metrics"),
  },
  mcpConfig: new ClaudeCodeMcpConfig(),
  hooks: new ClaudeCodeHooks(),
};
