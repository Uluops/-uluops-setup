/**
 * Gemini CLI Harness Profile
 *
 * Paths and metadata are verified from vendor docs.
 * MCP config uses `mcpServers` key (same shape as Claude Code)
 * but at a different file path (~/.gemini/settings.json).
 *
 * Gemini CLI requires `trust: true` in MCP server config to
 * allow automatic tool execution without confirmation prompts.
 */

import { homedir } from "node:os";
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
} from "../lib/settings-merger.js";

class GeminiMcpConfig implements McpConfigStrategy {
  async read(path: string): Promise<Record<string, unknown>> {
    return readConfig(path);
  }

  merge(
    config: Record<string, unknown>,
    apiKey: string,
  ): Record<string, unknown> {
    // Gemini CLI requires trust: true for a smooth experience
    return mergeUluopsMcp(config, apiKey, true);
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

class GeminiHooks implements HookStrategy {
  private static readonly HOOK_TYPE = "AfterTool";
  private static readonly MATCHER = "invoke_agent";

  async install(
    settingsPath: string,
    hookCommand: string,
    dryRun: boolean,
  ): Promise<boolean> {
    if (dryRun) return true;
    const settings = await readSettings(settingsPath);
    const merged = mergeUluopsHook(
      settings,
      hookCommand,
      GeminiHooks.HOOK_TYPE,
      GeminiHooks.MATCHER,
    );
    await writeSettings(settingsPath, merged);
    return true;
  }

  async remove(settingsPath: string, dryRun: boolean): Promise<void> {
    if (dryRun) return;
    const settings = await readSettings(settingsPath);
    const cleaned = removeUluopsHook(settings, GeminiHooks.HOOK_TYPE);
    await writeSettings(settingsPath, cleaned);
  }

  async check(settingsPath: string): Promise<boolean> {
    const settings = await readSettings(settingsPath);
    return hasUluopsHook(settings, GeminiHooks.HOOK_TYPE);
  }
}

const home = join(homedir(), ".gemini");

export const geminiCliProfile: HarnessProfile = {
  name: "gemini-cli",
  displayName: "Gemini CLI",
  homeDir: home,
  agentFormat: "markdown",
  factoryTarget: "gemini-cli",
  agentExtension: ".md",
  paths: {
    home,
    globalMcpConfig: join(home, "settings.json"),
    localMcpConfig: ".gemini/settings.json",
    agentsDir: join(home, "agents"),
    commandsDir: join(home, "commands"),
    settingsPath: join(home, "settings.json"),
    toolsDir: join(home, "tools", "agent-metrics"),
  },
  mcpConfig: new GeminiMcpConfig(),
  hooks: new GeminiHooks(),
};
