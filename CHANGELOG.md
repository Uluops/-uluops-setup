# Changelog

All notable changes to `@uluops/setup` will be documented in this file.

## [0.4.1] - 2026-05-29

### Fixed

- **agent-metrics dependency stuck at `^0.2.0`** — bumped to `^0.4.0` so `npx @uluops/setup` installs the v0.4.0 hook (slug-drop fix + explicit-tag-only detection). Previously, the caret range resolved to `>=0.2.0 <0.3.0`, silently excluding both v0.3.x and v0.4.x. Setup users were receiving a hook two minor versions behind npm. Closes the declarative form of the install.sh "stuck at v0.1.0" trap surfaced by Confucius analyst/forecaster runs on this package.

## [0.4.0] - 2026-05-04

### Added

- **Gemini CLI command support**: Commands, workflows, and pipelines now install as `.toml` files for Gemini CLI via transform-at-install (no per-harness asset duplication)
- **Pipelines namespace**: New `pipelines/` subdirectory for pipeline commands (ship, aristotle)
- **Agent transform-at-install**: Single source of truth for agent assets — frontmatter is transformed per harness at install time (Claude Code passthrough, Gemini CLI tool name mapping + envelope, OpenCode permission mapping)
- `anxiety-reader` agent added to starter pack (required by ship pipeline)

### Changed

- Agent assets flattened from `assets/agents/{harness}/` to `assets/agents/` (single source, -19K lines)
- `ship` pipeline moved from `workflows/` to `pipelines/` (correctly classified as PDL)
- `aristotle` pipeline moved from `workflows/` to `pipelines/` and regenerated from PDL source
- Pipeline assets regenerated from actual PDL sources (were incorrectly WDL-rendered)
- Commands install expanded to 3 subdirs: `agents/`, `workflows/`, `pipelines/`
- Starter pack: 23 agents, 23 agent commands, 3 workflows, 2 pipelines

### Fixed

- 30 validation issues resolved across 4 commits (type safety, test coverage, dead code, security)
- Manifest contentHash self-referential bug fixed
- `readCredentialsFile` now throws on malformed JSON instead of swallowing
- Dev dependency vulnerabilities resolved (picomatch, postcss, vite)
- Shell profile fence marker ordering guard added
- MCP config backups now timestamped to prevent overwrites
- Strict unused checks enabled in test tsconfig

## [0.3.0] - 2026-04-30

### Added
- Multi-harness architecture: OpenCode, Gemini CLI, and Codex harness profiles
- Slash command installation (agents + workflows) for Claude Code
- Agent metrics hook integration with SubagentStop event
- `--signup` flag for inline account creation (email + password)
- `--list` flag to preview available agents and workflows without installing
- `--verify` flag for installation health checks (manifest, files, API connectivity)
- `--local-defs` flag to install definitions in the project directory
- Harness aliases (`claude`, `oc`, `gemini`)
- Manifest-based installation tracking with per-harness state
- Atomic writes for all config file modifications
- Backup creation before config changes
- Dynamic agent/workflow catalog derived from assets at runtime

### Changed
- Renamed `/agents:validate` to `/agents:code-validate` for naming clarity
- Config files containing API keys now written with 0o600 permissions (owner-only)
- readConfig/readSettings now throw on malformed JSON instead of silently returning empty object
- Hook command paths are now quoted to handle spaces in installation paths
- .gitignore writes use atomic write pattern for crash safety
- Extracted display functions to dedicated module (cli.ts reduced from 758 to 647 lines)

### Fixed
- Package name misattribution in MCP availability check when fetch rejects
- Hardcoded TOOL_COUNT and AGENT_LIST replaced with dynamic asset scanning

## [0.2.0] - 2026-03-15

### Added
- Environment variable overrides for all paths
- Path probing and manifest validation
- Comprehensive test suite (140 tests across 18 files)
- Branded CLI banner

## [0.1.0] - 2026-03-01

### Added
- Initial release: zero-friction installer for Claude Code
- MCP server configuration (tracker + registry)
- Agent definition file installation
- API key resolution (flag, env var, credentials file, interactive prompt)
- Shell profile export with `--shell` flag
- `--uninstall` for clean removal
- `--dry-run` for previewing changes
