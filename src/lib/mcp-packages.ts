/**
 * Pinned MCP server package versions.
 *
 * Every harness's MCP config writer (claude-code/gemini-cli/opencode JSON
 * mergers, codex TOML writer) stamps these spec strings into the harness
 * config so `npx -y <spec>` resolves a known-good version instead of
 * latest. Pinning makes a `@uluops/setup` release self-contained — what
 * users get on first launch is what the package was tested against,
 * regardless of when later MCP server versions ship.
 *
 * **Bump rule:** when an MCP server publishes a new version, bump the
 * version here in the same setup release. A pinned setup install never
 * silently picks up a downstream regression; a missed bump shows up as
 * the next setup release stamping the previous combination.
 *
 * The bare package NAMES (without versions) remain available as
 * `MCP_PACKAGES` for the npm availability probe — that probe asks
 * "does this name exist on the registry" not "does this version exist".
 * Pinning the probe to a specific version would turn a temporary
 * registry blip on an older version into a setup failure even when
 * the latest version was reachable.
 */

export const OPS_MCP_PACKAGE = "@uluops/ops-mcp";
export const OPS_MCP_VERSION = "0.5.0";
export const OPS_MCP_SPEC = `${OPS_MCP_PACKAGE}@${OPS_MCP_VERSION}` as const;

export const REGISTRY_MCP_PACKAGE = "@uluops/registry-mcp";
export const REGISTRY_MCP_VERSION = "0.2.14";
export const REGISTRY_MCP_SPEC =
  `${REGISTRY_MCP_PACKAGE}@${REGISTRY_MCP_VERSION}` as const;

/**
 * Bare package names for the npm availability probe. The probe checks
 * existence on the registry, not version-specific resolvability, so it
 * uses these unversioned names.
 */
export const MCP_PACKAGES: readonly string[] = [
  OPS_MCP_PACKAGE,
  REGISTRY_MCP_PACKAGE,
];
