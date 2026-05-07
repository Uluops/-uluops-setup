import { readFile } from "node:fs/promises";
import { atomicWrite } from "./atomic-write.js";

interface McpServerConfig {
  command: string;
  args: string[];
  env: Record<string, string>;
  trust?: boolean;
}

export interface ClaudeConfig {
  mcpServers?: Record<string, McpServerConfig>;
  [key: string]: unknown;
}

const MCP_PACKAGES = ["uluops-tracker-mcp-client", "uluops-registry-mcp-client"];

/** Check whether the UluOps MCP client packages exist on the npm registry. Returns lists of available and missing packages. */
export async function checkMcpPackageAvailability(): Promise<{
  available: string[];
  missing: string[];
}> {
  const available: string[] = [];
  const missing: string[] = [];

  const results = await Promise.allSettled(
    MCP_PACKAGES.map((pkg) =>
      fetch(`https://registry.npmjs.org/${pkg}`, {
        method: "HEAD",
        signal: AbortSignal.timeout(5000),
        redirect: "follow",
      }).then((res) => ({ pkg, ok: res.ok }))
    ),
  );

  for (let i = 0; i < results.length; i++) {
    const result = results[i]!;
    if (result.status === "fulfilled" && result.value.ok) {
      available.push(result.value.pkg);
    } else {
      const pkg =
        result.status === "fulfilled"
          ? result.value.pkg
          : MCP_PACKAGES[i] ?? "unknown";
      missing.push(pkg);
    }
  }

  return { available, missing };
}

/**
 * Read an existing config file, or return empty object if it doesn't exist.
 * Throws on malformed JSON to prevent silent data loss during merge+write.
 */
export async function readConfig(path: string): Promise<ClaudeConfig> {
  let raw: string;
  try {
    raw = await readFile(path, "utf-8");
  } catch {
    return {}; // File doesn't exist — fresh config
  }
  return JSON.parse(raw) as ClaudeConfig;
}

/**
 * Merge UluOps MCP server entries into a config, preserving all other keys.
 */
export function mergeUluopsMcp(
  config: ClaudeConfig,
  apiKey: string,
  trust = false,
): ClaudeConfig {
  const existing = config.mcpServers ?? {};
  const trustField = trust ? { trust: true } : {};

  return {
    ...config,
    mcpServers: {
      ...existing,
      "uluops-tracker": {
        command: "npx",
        args: ["-y", "uluops-tracker-mcp-client"],
        env: {
          ULUOPS_BASE_URL: "https://api.uluops.ai/api/v1",
          ULUOPS_API_KEY: apiKey,
        },
        ...trustField,
      },
      "uluops-registry": {
        command: "npx",
        args: ["-y", "uluops-registry-mcp-client"],
        env: {
          ULUOPS_REGISTRY_URL: "https://api.uluops.ai/api/v1/registry",
          ULUOPS_API_KEY: apiKey,
        },
        ...trustField,
      },
    },
  };
}

/**
 * Remove UluOps MCP server entries from a config.
 */
export function removeUluopsMcp(config: ClaudeConfig): ClaudeConfig {
  const servers = { ...config.mcpServers };
  delete servers["uluops-tracker"];
  delete servers["uluops-registry"];

  const result = { ...config };
  if (Object.keys(servers).length === 0) {
    delete result.mcpServers;
  } else {
    result.mcpServers = servers;
  }
  return result;
}

/**
 * Write config back to file, preserving formatting.
 */
export async function writeConfig(
  path: string,
  config: ClaudeConfig,
): Promise<void> {
  await atomicWrite(path, JSON.stringify(config, null, 2) + "\n", {
    mode: 0o600,
  });
}
