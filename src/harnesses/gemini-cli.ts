/**
 * Gemini CLI Harness Profile (Scaffold)
 *
 * Paths and metadata are verified from vendor docs.
 * MCP config uses `mcpServers` key (same shape as Claude Code)
 * but at a different file path (~/.gemini/settings.json).
 *
 * NOT YET TESTED with UluOps agents. McpConfigStrategy throws
 * until integration testing is complete.
 *
 * Note: Gemini CLI cannot have underscores in MCP server names
 * (FQN format mcp_serverName_toolName uses underscore as delimiter).
 * Our names use hyphens — safe.
 */

import { homedir } from "node:os";
import { join } from "node:path";
import type { HarnessProfile, McpConfigStrategy } from "./types.js";
import { HarnessNotTestedError } from "./types.js";

class GeminiMcpConfig implements McpConfigStrategy {
  async read(): Promise<Record<string, unknown>> {
    throw new HarnessNotTestedError("Gemini CLI");
  }
  merge(): Record<string, unknown> {
    throw new HarnessNotTestedError("Gemini CLI");
  }
  remove(): Record<string, unknown> {
    throw new HarnessNotTestedError("Gemini CLI");
  }
  async write(): Promise<void> {
    throw new HarnessNotTestedError("Gemini CLI");
  }
  check(): boolean {
    return false;
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
    settingsPath: null,
    toolsDir: null,
  },
  mcpConfig: new GeminiMcpConfig(),
  hooks: null,
};
