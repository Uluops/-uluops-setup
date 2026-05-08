/**
 * Codex Harness Profile (Scaffold)
 *
 * Paths and metadata are verified from vendor docs.
 * Codex uses TOML config with `mcp_servers` key (nested tables).
 * Agent definitions are TOML, not markdown.
 * Skills use a different path ($HOME/.agents/skills/) than agents (~/.codex/agents/).
 *
 * NOT YET TESTED with UluOps agents. McpConfigStrategy throws
 * until integration testing is complete.
 *
 * Will require `smol-toml` dependency when fully implemented.
 */

import { homedir } from "node:os";
import { join } from "node:path";
import type { HarnessProfile, McpConfigStrategy } from "./types.js";
import { HarnessNotTestedError } from "./types.js";

class CodexMcpConfig implements McpConfigStrategy {
  async read(): Promise<Record<string, unknown>> {
    throw new HarnessNotTestedError("Codex (agent format compatibility under review)");
  }
  merge(): Record<string, unknown> {
    throw new HarnessNotTestedError("Codex (agent format compatibility under review)");
  }
  remove(): Record<string, unknown> {
    throw new HarnessNotTestedError("Codex (agent format compatibility under review)");
  }
  async write(): Promise<void> {
    throw new HarnessNotTestedError("Codex (agent format compatibility under review)");
  }
  check(): boolean {
    return false;
  }
}

const home = join(homedir(), ".codex");

export const codexProfile: HarnessProfile = {
  name: "codex",
  displayName: "Codex",
  homeDir: home,
  agentFormat: "toml",
  factoryTarget: "codex",
  agentExtension: ".toml",
  paths: {
    home,
    globalMcpConfig: join(home, "config.toml"),
    localMcpConfig: ".codex/config.toml",
    agentsDir: join(home, "agents"),
    commandsDir: join(homedir(), ".agents", "skills"),
    settingsPath: null,
    toolsDir: null,
  },
  mcpConfig: new CodexMcpConfig(),
  hooks: null,
};
