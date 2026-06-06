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

const MCP_PACKAGES = ["@uluops/ops-mcp", "@uluops/registry-mcp"];

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

  // Per-index correspondence: results[i] corresponds to MCP_PACKAGES[i] by
  // Promise.allSettled's stable ordering. The previous `?? "unknown"` fallback
  // could emit a literal "unknown" string into `missing`, hiding the real
  // failure reason (DNS error, timeout, 404) under an undiagnosable label.
  for (let i = 0; i < results.length; i++) {
    const result = results[i]!;
    const pkg = MCP_PACKAGES[i]!;
    if (result.status === "fulfilled") {
      if (result.value.ok) {
        available.push(pkg);
      } else {
        // Registry returned non-2xx — package likely missing or unpublished.
        missing.push(pkg);
      }
    } else {
      // Network failure: AbortError (timeout), DNS, TLS, EAI_AGAIN, etc.
      const reason =
        result.reason instanceof Error
          ? result.reason.message
          : String(result.reason);
      missing.push(`${pkg} (network: ${reason})`);
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
  try {
    return JSON.parse(raw) as ClaudeConfig;
  } catch {
    throw new Error(`Failed to parse config at ${path} — file contains invalid JSON`);
  }
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

  // Backend URLs are resolved by the respective MCP servers (@uluops/ops-mcp
  // and @uluops/registry-mcp) against their bundled SDKs. Stamping
  // ULUOPS_BASE_URL / ULUOPS_REGISTRY_URL here would override that resolution
  // with a value that could go stale if production endpoints ever shift.
  return {
    ...config,
    mcpServers: {
      ...existing,
      "uluops-tracker": {
        command: "npx",
        args: ["-y", "@uluops/ops-mcp"],
        env: {
          ULUOPS_API_KEY: apiKey,
        },
        ...trustField,
      },
      "uluops-registry": {
        command: "npx",
        args: ["-y", "@uluops/registry-mcp"],
        env: {
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
