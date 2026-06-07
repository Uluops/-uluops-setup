/**
 * Codex Harness Profile
 *
 * Codex uses TOML config with `mcp_servers` nested tables.
 * Agent definitions are TOML, not markdown.
 * Skills live under ~/.codex/skills and are the preferred Codex-native
 * surface for UluOps operator workflows.
 */

import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  ULUOPS_SERVERS,
  type HarnessProfile,
  type McpConfigStrategy,
} from "./types.js";
import { atomicWrite } from "../lib/atomic-write.js";

const RAW_TOML = "__rawToml";

function tomlString(value: string): string {
  return JSON.stringify(value);
}

function serverBlock(name: string, pkg: string, apiKey: string): string {
  return [
    `[mcp_servers.${tomlString(name)}]`,
    `command = "npx"`,
    `args = ["-y", ${tomlString(pkg)}]`,
    ``,
    `[mcp_servers.${tomlString(name)}.env]`,
    `ULUOPS_API_KEY = ${tomlString(apiKey)}`,
  ].join("\n");
}

function isServerTableFor(name: string, table: string): boolean {
  return table === `mcp_servers.${name}` || table === `mcp_servers."${name}"`;
}

function isServerSubtableFor(name: string, table: string): boolean {
  const unquotedPrefix = `mcp_servers.${name}.`;
  const quotedPrefix = `mcp_servers."${name}".`;
  return table.startsWith(unquotedPrefix) || table.startsWith(quotedPrefix);
}

function removeServerConfigBlocks(raw: string, name: string): string {
  const lines = raw.split("\n");
  const kept: string[] = [];
  let skipping = false;

  for (const line of lines) {
    const table = line.trim().match(/^\[([^\]]+)\]$/)?.[1];
    if (table) {
      skipping = isServerTableFor(name, table) || table === `mcp_servers.${name}.env` || table === `mcp_servers."${name}".env`;
    }
    if (!skipping) kept.push(line);
  }

  return kept.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd();
}

function removeServerSubtree(raw: string, name: string): string {
  const lines = raw.split("\n");
  const kept: string[] = [];
  let skipping = false;

  for (const line of lines) {
    const table = line.trim().match(/^\[([^\]]+)\]$/)?.[1];
    if (table) {
      skipping = isServerTableFor(name, table) || isServerSubtableFor(name, table);
    }
    if (!skipping) kept.push(line);
  }

  return kept.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd();
}

class CodexMcpConfig implements McpConfigStrategy {
  async read(path: string): Promise<Record<string, unknown>> {
    try {
      return { [RAW_TOML]: await readFile(path, "utf-8") };
    } catch {
      return { [RAW_TOML]: "" };
    }
  }

  merge(
    config: Record<string, unknown>,
    apiKey: string,
  ): Record<string, unknown> {
    let raw = typeof config[RAW_TOML] === "string" ? config[RAW_TOML] : "";
    raw = removeServerConfigBlocks(removeServerConfigBlocks(raw, "uluops-tracker"), "uluops-registry");
    const blocks = [
      serverBlock("uluops-tracker", "@uluops/ops-mcp", apiKey),
      serverBlock("uluops-registry", "@uluops/registry-mcp", apiKey),
    ].join("\n\n");
    return { [RAW_TOML]: [raw.trimEnd(), blocks].filter(Boolean).join("\n\n") + "\n" };
  }

  remove(config: Record<string, unknown>): Record<string, unknown> {
    let raw = typeof config[RAW_TOML] === "string" ? config[RAW_TOML] : "";
    for (const name of ULUOPS_SERVERS) {
      raw = removeServerSubtree(raw, name);
    }
    return { [RAW_TOML]: raw.trimEnd() ? `${raw.trimEnd()}\n` : "" };
  }

  async write(path: string, config: Record<string, unknown>): Promise<void> {
    const raw = typeof config[RAW_TOML] === "string" ? config[RAW_TOML] : "";
    await atomicWrite(path, raw, { mode: 0o600 });
  }

  check(config: Record<string, unknown>): boolean {
    const raw = typeof config[RAW_TOML] === "string" ? config[RAW_TOML] : "";
    return ULUOPS_SERVERS.every((name) => {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(String.raw`\[mcp_servers\.(?:"${escaped}"|${escaped})\]`).test(raw);
    });
  }
}

const home = join(homedir(), ".codex");

export const codexProfile: HarnessProfile = {
  name: "codex",
  displayName: "Codex",
  status: "experimental",
  homeDir: home,
  agentFormat: "toml",
  factoryTarget: "codex",
  agentExtension: ".toml",
  paths: {
    home,
    globalMcpConfig: join(home, "config.toml"),
    localMcpConfig: ".codex/config.toml",
    agentsDir: join(home, "agents"),
    commandsDir: join(home, "commands"),
    skillsDir: join(home, "skills"),
    settingsPath: null,
    toolsDir: null,
  },
  mcpConfig: new CodexMcpConfig(),
  hooks: null,
};
