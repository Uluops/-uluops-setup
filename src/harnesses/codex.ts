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
import { OPS_MCP_SPEC, REGISTRY_MCP_SPEC } from "../lib/mcp-packages.js";

const RAW_TOML = "__rawToml";

/**
 * Tools to seed with `approval_mode = "approve"` (Codex's auto-allow opt-in).
 *
 * Seeded ONLY when the user has no prior `[mcp_servers.NAME.tools.*]` blocks
 * for the server — a re-install over a hand-tuned config preserves the user's
 * choices verbatim (the merge bails on its own seeds the moment it sees user
 * intent).
 *
 * Only read-side tools are seeded. Writes still prompt — the user retains a
 * choice point on every state-changing operation. Lists mirror the
 * `sideEffects: 'read'` declarations in the respective server's tool-registry
 * (sources of truth: ops-uluops-mcp/src/config/tool-registry.ts and
 * uluops-registry-mcp/src/config/tool-registry.ts). If a new read tool ships
 * there, add it here in the same PR — Codex users will silently get a prompt
 * on first use otherwise.
 */
const TRACKER_READ_TOOLS: readonly string[] = [
  "diff_runs",
  "get_agent_lifecycle",
  "get_agent_matrix",
  "get_agent_reliability",
  "get_agent_runs_analysis",
  "get_analytics",
  "get_burndown",
  "get_discovery",
  "get_full_taxonomy_analytics",
  "get_issue_by_fingerprint",
  "get_issue_details",
  "get_issue_history",
  "get_latest_run",
  "get_project",
  "get_project_analysis",
  "get_project_summary",
  "get_project_trends",
  "get_run",
  "get_run_analysis",
  "get_run_details",
  "get_taxonomy",
  "get_velocity",
  "list_agents",
  "list_projects",
  "list_runs",
  "query_analysis_records",
  "query_issues",
  "search_issues",
  "validate_run",
];

const REGISTRY_READ_TOOLS: readonly string[] = [
  "batch_users",
  "compare_effectiveness",
  "diff_versions",
  "get_definition",
  "get_dependencies",
  "get_dependents",
  "get_diff_impact",
  "get_ecosystem_overview",
  "get_effectiveness",
  "get_evolution",
  "get_execution_stats",
  "get_fork_lineage",
  "get_health",
  "get_language",
  "get_lineage",
  "get_model",
  "get_translation_analytics",
  "get_translator_version",
  "get_user",
  "is_forkable",
  "list_aliases",
  "list_definitions",
  "list_forks",
  "list_languages",
  "list_models",
  "list_providers",
  "list_versions",
  "render_definition",
  "resolve_alias",
  "search_definitions",
  "set_default_type",
  "validate_definition",
];

function tomlString(value: string): string {
  return JSON.stringify(value);
}

function toolBlock(serverName: string, toolName: string): string {
  return [
    `[mcp_servers.${serverName}.tools.${toolName}]`,
    `approval_mode = "approve"`,
  ].join("\n");
}

function serverBlock(
  name: string,
  pkg: string,
  apiKey: string,
  seedTools: readonly string[],
): string {
  const lines: string[] = [
    `[mcp_servers.${name}]`,
    `command = "npx"`,
    `args = ["-y", ${tomlString(pkg)}]`,
    ``,
    `[mcp_servers.${name}.env]`,
    `ULUOPS_API_KEY = ${tomlString(apiKey)}`,
  ];
  for (const tool of seedTools) {
    lines.push(``, toolBlock(name, tool));
  }
  return lines.join("\n");
}

function isServerTableFor(name: string, table: string): boolean {
  return table === `mcp_servers.${name}` || table === `mcp_servers."${name}"`;
}

function isServerEnvTableFor(name: string, table: string): boolean {
  return (
    table === `mcp_servers.${name}.env` ||
    table === `mcp_servers."${name}".env`
  );
}

function isServerSubtableFor(name: string, table: string): boolean {
  const unquotedPrefix = `mcp_servers.${name}.`;
  const quotedPrefix = `mcp_servers."${name}".`;
  return table.startsWith(unquotedPrefix) || table.startsWith(quotedPrefix);
}

function isServerToolTableFor(name: string, table: string): boolean {
  const unquotedPrefix = `mcp_servers.${name}.tools.`;
  const quotedPrefix = `mcp_servers."${name}".tools.`;
  return table.startsWith(unquotedPrefix) || table.startsWith(quotedPrefix);
}

/**
 * Strip the main `[mcp_servers.NAME]` and `[mcp_servers.NAME.env]` blocks
 * but preserve `[mcp_servers.NAME.tools.*]` blocks. Tool overrides may be
 * user customizations — destroying them on every re-install would punish
 * anyone who hand-edited their Codex config to deny a specific tool or to
 * approve one we don't seed.
 */
function removeServerConfigBlocks(raw: string, name: string): string {
  const lines = raw.split("\n");
  const kept: string[] = [];
  let skipping = false;

  for (const line of lines) {
    const table = line.trim().match(/^\[([^\]]+)\]$/)?.[1];
    if (table) {
      skipping = isServerTableFor(name, table) || isServerEnvTableFor(name, table);
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

function hasUserToolEntries(raw: string, name: string): boolean {
  for (const line of raw.split("\n")) {
    const table = line.trim().match(/^\[([^\]]+)\]$/)?.[1];
    if (table && isServerToolTableFor(name, table)) return true;
  }
  return false;
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

    // Detect prior user customization BEFORE we strip anything. A hand-tuned
    // config (any `[mcp_servers.NAME.tools.*]` block present) signals user
    // intent — we replay only main + env, leaving the user's per-tool
    // approval choices untouched. A fresh config gets the seeded read-tool
    // approvals so first-launch UX skips the prompt cascade.
    const trackerHasUserTools = hasUserToolEntries(raw, "uluops-tracker");
    const registryHasUserTools = hasUserToolEntries(raw, "uluops-registry");

    raw = removeServerConfigBlocks(
      removeServerConfigBlocks(raw, "uluops-tracker"),
      "uluops-registry",
    );

    const blocks = [
      serverBlock(
        "uluops-tracker",
        OPS_MCP_SPEC,
        apiKey,
        trackerHasUserTools ? [] : TRACKER_READ_TOOLS,
      ),
      serverBlock(
        "uluops-registry",
        REGISTRY_MCP_SPEC,
        apiKey,
        registryHasUserTools ? [] : REGISTRY_READ_TOOLS,
      ),
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
  status: "stable",
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
