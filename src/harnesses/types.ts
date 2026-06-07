/**
 * Harness Type System
 *
 * Defines the abstraction layer for multi-harness support.
 * Each harness (Claude Code, OpenCode, Codex, Gemini CLI) implements
 * these interfaces to encapsulate its config format, paths, and capabilities.
 */

/**
 * Maturity status of a harness profile.
 *
 * - `"stable"` — implementation is tested end-to-end and safe to auto-detect.
 *   detectHarnesses() returns these.
 * - `"experimental"` — scaffold only; throws HarnessNotTestedError on most
 *   operations. getProfile() still resolves these (so `--harness <name>`
 *   surfaces the explicit error), but detectHarnesses() filters them out so
 *   automatic install never picks an unusable profile.
 */
export type HarnessStatus = "stable" | "experimental";

/** Static definition of a harness — no runtime state. */
export interface HarnessProfile {
  /** Canonical name (e.g., 'claude-code', 'opencode', 'codex', 'gemini-cli') */
  readonly name: string;

  /** Display name for CLI output (e.g., 'Claude Code', 'OpenCode') */
  readonly displayName: string;

  /**
   * Maturity status. Experimental profiles are excluded from auto-detection
   * but still accept an explicit `--harness` flag so users can opt in to
   * the not-yet-tested error surface.
   */
  readonly status: HarnessStatus;

  /** Home directory for this harness */
  readonly homeDir: string;

  /** Agent definition format */
  readonly agentFormat: "markdown" | "toml";

  /** Target name for definition-factory rendering */
  readonly factoryTarget: string;

  /** File extension for agent definitions */
  readonly agentExtension: ".md" | ".toml";

  /** Paths for this harness */
  readonly paths: HarnessPaths;

  /** MCP config strategy for this harness's config format */
  readonly mcpConfig: McpConfigStrategy;

  /** Hook operations (null if harness doesn't support post-agent hooks) */
  readonly hooks: HookStrategy | null;
}

export interface HarnessPaths {
  /** Home dir (e.g., ~/.claude/) */
  readonly home: string;
  /** Global MCP config (e.g., ~/.claude.json, ~/.config/opencode/opencode.json) */
  readonly globalMcpConfig: string;
  /** Project-scoped MCP config filename (e.g., .mcp.json, opencode.json) — resolved relative to project root */
  readonly localMcpConfig: string;
  /** Global agent definitions dir */
  readonly agentsDir: string;
  /** Global commands/skills dir */
  readonly commandsDir: string;
  /** Global Codex-style skills dir, when the harness supports skills as first-class install assets */
  readonly skillsDir?: string | null;
  /** Settings file path, or null if harness has no settings file */
  readonly settingsPath: string | null;
  /** Tool installation dir, or null if harness has no tool installation */
  readonly toolsDir: string | null;
}

/**
 * Encapsulates format-specific MCP config read/merge/write.
 * Claude Code/Gemini use JSON with `mcpServers` key.
 * OpenCode uses JSON/JSONC with `mcp` key and different entry shape.
 * Codex uses TOML with `mcp_servers` key.
 */
export interface McpConfigStrategy {
  /** Read existing config from disk. Returns parsed object. Returns {} if file missing. Throws ConfigParseError if malformed. */
  read(path: string): Promise<Record<string, unknown>>;
  /** Merge UluOps MCP servers into the parsed config. Format-aware. */
  merge(
    config: Record<string, unknown>,
    apiKey: string,
  ): Record<string, unknown>;
  /** Remove UluOps MCP servers from the parsed config. */
  remove(config: Record<string, unknown>): Record<string, unknown>;
  /** Write config back to disk in the harness's native format. Uses atomic write. */
  write(path: string, config: Record<string, unknown>): Promise<void>;
  /** Check if UluOps MCP servers are present in the parsed config. */
  check(config: Record<string, unknown>): boolean;
}

/**
 * Hook strategy for harnesses that support post-agent execution hooks.
 * Currently only Claude Code supports this (SubagentStop event).
 */
export interface HookStrategy {
  /**
   * Install the agent-metrics post-execution hook.
   * @returns true if hook was installed or updated, false if already current (no-op).
   * In dry-run mode, returns true (would install) without writing.
   */
  install(
    settingsPath: string,
    hookCommand: string,
    dryRun: boolean,
  ): Promise<boolean>;
  /** Remove the hook. No-op if not installed. */
  remove(settingsPath: string, dryRun: boolean): Promise<void>;
  /** Check if hook is currently installed. */
  check(settingsPath: string): Promise<boolean>;
}

/** MCP server names installed by UluOps setup. Shared across all harnesses. */
export const ULUOPS_SERVERS = ["uluops-tracker", "uluops-registry"] as const;

/** Thrown when a harness config file cannot be parsed. */
export class ConfigParseError extends Error {
  constructor(
    public readonly path: string,
    cause: unknown,
  ) {
    const msg =
      cause instanceof Error ? cause.message : String(cause);
    super(`Failed to parse config at ${path}: ${msg}`);
    this.name = "ConfigParseError";
  }
}

/** Thrown when a harness is scaffolded but not yet tested/implemented. */
export class HarnessNotTestedError extends Error {
  constructor(harnessName: string) {
    super(
      // Keep this list in sync with profiles whose `status === "stable"`.
      // Today: claude-code, opencode, gemini-cli. When a new stable profile
      // lands, add it here so the error stays actionable.
      `${harnessName} harness is not yet tested. Use --harness claude-code, --harness opencode, or --harness gemini-cli.`,
    );
    this.name = "HarnessNotTestedError";
  }
}
