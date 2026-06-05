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
import { join, isAbsolute } from "node:path";
import { parse as parseJsonc } from "jsonc-parser";
import { ULUOPS_SERVERS, ConfigParseError, type HarnessProfile, type McpConfigStrategy } from "./types.js";
import { atomicWrite } from "../lib/atomic-write.js";

interface OpenCodeMcpServer {
  type: string;
  command: string[];
  enabled: boolean;
  timeout?: number;
  environment?: Record<string, string>;
}

class OpenCodeMcpConfig implements McpConfigStrategy {
  /** Maps requested path → actual resolved path (for .jsonc fallback). */
  private resolvedPaths = new Map<string, string>();

  async read(path: string): Promise<Record<string, unknown>> {
    // Try the given path, then probe for .jsonc variant
    let raw: string | null = null;
    const candidates = [path, path.replace(/\.json$/, ".jsonc")];
    for (const p of candidates) {
      try {
        raw = await readFile(p, "utf-8");
        this.resolvedPaths.set(path, p);
        break;
      } catch {
        // Try next
      }
    }
    if (raw === null) {
      this.resolvedPaths.set(path, path);
      return {};
    }

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
    const raw = config["mcp"];
    const existing = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
    const tracker: OpenCodeMcpServer = {
      type: "local",
      command: ["npx", "-y", "@uluops/ops-mcp"],
      enabled: true,
      timeout: 30000,
      environment: {
        ULUOPS_BASE_URL: "https://api.uluops.ai/api/v1",
        ULUOPS_API_KEY: apiKey,
      },
    };
    const registry: OpenCodeMcpServer = {
      type: "local",
      command: ["npx", "-y", "@uluops/registry-mcp"],
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
    if (!config["mcp"] || typeof config["mcp"] !== "object") return config;

    const mcp = { ...(config["mcp"] as Record<string, unknown>) };
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
    // Write back to the path that was actually read (may be .jsonc)
    const target = this.resolvedPaths.get(path) ?? path;
    await atomicWrite(target, JSON.stringify(config, null, 2) + "\n", {
      mode: 0o600,
    });
  }

  check(config: Record<string, unknown>): boolean {
    const mcp = config["mcp"] as Record<string, unknown> | undefined;
    if (!mcp) return false;
    return ULUOPS_SERVERS.every((name) => name in mcp);
  }
}

const xdgConfig = (() => {
  const env = process.env["XDG_CONFIG_HOME"];
  if (env) {
    if (!isAbsolute(env) || env.includes("..")) {
      throw new Error(
        `XDG_CONFIG_HOME must be an absolute path without traversal: ${env}`,
      );
    }
    return env;
  }
  return join(homedir(), ".config");
})();
const home = join(xdgConfig, "opencode");

export const opencodeProfile: HarnessProfile = {
  name: "opencode",
  displayName: "OpenCode",
  status: "stable",
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
