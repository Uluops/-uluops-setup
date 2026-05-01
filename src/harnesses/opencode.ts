/**
 * OpenCode Harness Profile
 *
 * OpenCode uses JSON/JSONC config with a structurally different MCP shape:
 * - `mcp` key (not `mcpServers`)
 * - `type: "local"` required
 * - `command` as flat array (not separate command/args)
 * - `environment` (not `env`)
 * - `enabled: true` and `timeout: 30000` recommended
 *
 * Verified working shape from ~/opencode.jsonc (2026-04-30).
 */

import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { parse as parseJsonc } from "jsonc-parser";
import type { HarnessProfile, McpConfigStrategy } from "./types.js";
import { ConfigParseError } from "./types.js";
import { atomicWrite } from "../lib/atomic-write.js";

const ULUOPS_SERVERS = ["uluops-tracker", "uluops-registry"];

interface OpenCodeMcpServer {
  type: string;
  command: string[];
  enabled: boolean;
  timeout?: number;
  environment?: Record<string, string>;
}

class OpenCodeMcpConfig implements McpConfigStrategy {
  async read(path: string): Promise<Record<string, unknown>> {
    // Try the given path, then probe for .jsonc variant
    let raw: string | null = null;
    for (const p of [path, path.replace(/\.json$/, ".jsonc")]) {
      try {
        raw = await readFile(p, "utf-8");
        break;
      } catch {
        // Try next
      }
    }
    if (raw === null) return {};

    try {
      return parseJsonc(raw) as Record<string, unknown>;
    } catch (err) {
      throw new ConfigParseError(path, err);
    }
  }

  merge(
    config: Record<string, unknown>,
    apiKey: string,
  ): Record<string, unknown> {
    const existing = (config["mcp"] ?? {}) as Record<string, unknown>;
    const tracker: OpenCodeMcpServer = {
      type: "local",
      command: ["npx", "-y", "uluops-tracker-mcp-client"],
      enabled: true,
      timeout: 30000,
      environment: {
        ULUOPS_TRACKER_API_URL: "https://api.uluops.ai/api/v1",
        ULUOPS_TRACKER_API_KEY: apiKey,
      },
    };
    const registry: OpenCodeMcpServer = {
      type: "local",
      command: ["npx", "-y", "uluops-registry-mcp-client"],
      enabled: true,
      timeout: 30000,
      environment: {
        ULUOPS_REGISTRY_URL: "https://api.uluops.ai/api/v1/registry",
        ULUOPS_API_KEY: apiKey,
      },
    };
    return {
      ...config,
      mcp: {
        ...existing,
        "uluops-tracker": tracker,
        "uluops-registry": registry,
      },
    };
  }

  remove(config: Record<string, unknown>): Record<string, unknown> {
    const mcp = { ...(config["mcp"] as Record<string, unknown> | undefined) };
    if (!mcp) return config;

    for (const name of ULUOPS_SERVERS) {
      delete mcp[name];
    }

    const result = { ...config };
    if (Object.keys(mcp).length === 0) {
      delete result["mcp"];
    } else {
      result["mcp"] = mcp;
    }
    return result;
  }

  async write(
    path: string,
    config: Record<string, unknown>,
  ): Promise<void> {
    await atomicWrite(path, JSON.stringify(config, null, 2) + "\n");
  }

  check(config: Record<string, unknown>): boolean {
    const mcp = config["mcp"] as Record<string, unknown> | undefined;
    if (!mcp) return false;
    return ULUOPS_SERVERS.every((name) => name in mcp);
  }
}

const xdgConfig =
  process.env["XDG_CONFIG_HOME"] ?? join(homedir(), ".config");
const home = join(xdgConfig, "opencode");

export const opencodeProfile: HarnessProfile = {
  name: "opencode",
  displayName: "OpenCode",
  homeDir: home,
  agentFormat: "markdown",
  factoryTarget: "opencode",
  agentExtension: ".md",
  paths: {
    home,
    globalMcpConfig: join(home, "opencode.json"),
    localMcpConfig: "opencode.json",
    agentsDir: join(home, "agents"),
    commandsDir: join(home, "commands"),
    settingsPath: null,
    toolsDir: null,
  },
  mcpConfig: new OpenCodeMcpConfig(),
  hooks: null,
};
