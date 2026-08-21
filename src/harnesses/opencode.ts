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
import {
  parse as parseJsonc,
  type ParseError as JsoncParseError,
} from "jsonc-parser";
import { ULUOPS_SERVERS, ConfigParseError, type HarnessProfile, type McpConfigStrategy } from "./types.js";
import { atomicWrite } from "../lib/atomic-write.js";
import { isEnoent } from "../lib/file-ops.js";
import { OPS_MCP_SPEC, REGISTRY_MCP_SPEC } from "../lib/mcp-packages.js";

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
      } catch (err) {
        if (isEnoent(err)) continue; // Try next candidate
        // Unreadable-but-PRESENT must never fall through to "no file →
        // fresh config" — the write would replace the file we couldn't read.
        throw new Error(
          `Could not read OpenCode config at ${p} (${err instanceof Error ? err.message : String(err)}) — refusing to continue rather than overwrite a file that exists but could not be read. Nothing was modified.`,
        );
      }
    }
    if (raw === null) {
      this.resolvedPaths.set(path, path);
      return {};
    }

    // jsonc-parser's parse() is error-RECOVERING, never throwing: on a
    // syntax error it silently returns whatever it salvaged, and everything
    // after the error point would be dropped, merged, and written back over
    // the user's file. The errors out-param is the only honest signal.
    const parseErrors: JsoncParseError[] = [];
    const parsed: unknown = parseJsonc(raw, parseErrors, {
      allowTrailingComma: true,
    });
    if (parseErrors.length > 0) {
      const first = parseErrors[0]!;
      throw new ConfigParseError(
        path,
        new Error(
          `invalid JSONC (error code ${first.error} at offset ${first.offset}) — fix or remove the file and re-run; nothing was modified`,
        ),
      );
    }
    // Same top-level gate as config-merger/settings-merger: valid JSONC that
    // isn't an object cannot be merged into — writing it back mangled with
    // no error is worse than refusing.
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new ConfigParseError(
        path,
        new Error("expected a JSON object at the top level"),
      );
    }
    return parsed as Record<string, unknown>;
  }

  merge(
    config: Record<string, unknown>,
    apiKey: string,
  ): Record<string, unknown> {
    const raw = config["mcp"];
    const existing = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
    // Backend URLs resolved by @uluops/ops-mcp and @uluops/registry-mcp via
    // their bundled SDKs. See lib/config-merger.ts for rationale.
    const tracker: OpenCodeMcpServer = {
      type: "local",
      command: ["npx", "-y", OPS_MCP_SPEC],
      enabled: true,
      timeout: 30000,
      environment: {
        ULUOPS_API_KEY: apiKey,
      },
    };
    const registry: OpenCodeMcpServer = {
      type: "local",
      command: ["npx", "-y", REGISTRY_MCP_SPEC],
      enabled: true,
      timeout: 30000,
      environment: {
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

/**
 * XDG_CONFIG_HOME validation is deferred from module-load to first opencode
 * use. The previous design threw at import, which crashed `uluops-setup
 * --help` and `--uninstall` for any user with an invalid XDG_CONFIG_HOME —
 * blocking them from running the very commands they need to recover. Now
 * the IIFE caches any validation error and the harness registry calls
 * `assertOpencodeEnvironment()` only when the opencode profile is actually
 * selected. Unselected, the module loads cleanly and the fallback path is
 * used for shape-only computations.
 */
let deferredXdgConfigError: Error | null = null;
const xdgConfig = (() => {
  const env = process.env["XDG_CONFIG_HOME"];
  if (env) {
    if (!isAbsolute(env) || env.includes("..")) {
      deferredXdgConfigError = new Error(
        `XDG_CONFIG_HOME must be an absolute path without traversal: ${env}`,
      );
      return join(homedir(), ".config");
    }
    return env;
  }
  return join(homedir(), ".config");
})();
const home = join(xdgConfig, "opencode");

/**
 * Throws the deferred XDG_CONFIG_HOME validation error, if any. Called by
 * the harness registry when the user actually selects opencode (via
 * `--harness opencode` or auto-detection picking it). Other entry points
 * (`--help`, `--uninstall` of an unrelated harness, `--list`) never trigger
 * this and remain usable.
 */
export function assertOpencodeEnvironment(): void {
  if (deferredXdgConfigError) throw deferredXdgConfigError;
}

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
