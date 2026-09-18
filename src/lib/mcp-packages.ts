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
 * The availability probe checks the PINNED VERSION, not the bare name.
 * This used to be deliberate the other way ("a registry blip on an older
 * version shouldn't fail setup when latest is reachable") — reversed
 * 2026-08-21: the harness runs `npx -y <PINNED SPEC>`, so the pin being
 * unresolvable is exactly the condition that must fail loudly at install
 * time instead of surfacing hours later as an opaque npx error at first
 * MCP launch. A pin is not a publish; the probe is what enforces that here.
 */

export const OPS_MCP_PACKAGE = "@uluops/ops-mcp";
export const OPS_MCP_VERSION = "0.20.1";
export const OPS_MCP_SPEC = `${OPS_MCP_PACKAGE}@${OPS_MCP_VERSION}` as const;

export const REGISTRY_MCP_PACKAGE = "@uluops/registry-mcp";
export const REGISTRY_MCP_VERSION = "0.8.0";
export const REGISTRY_MCP_SPEC =
  `${REGISTRY_MCP_PACKAGE}@${REGISTRY_MCP_VERSION}` as const;

/** Probe targets: the pinned versions the harness will actually resolve. */
export const MCP_PROBE_TARGETS: readonly { pkg: string; version: string }[] = [
  { pkg: OPS_MCP_PACKAGE, version: OPS_MCP_VERSION },
  { pkg: REGISTRY_MCP_PACKAGE, version: REGISTRY_MCP_VERSION },
];

/** Bare names, kept for display and for callers that only need identity. */
export const MCP_PACKAGES: readonly string[] = [
  OPS_MCP_PACKAGE,
  REGISTRY_MCP_PACKAGE,
];
