# Changelog

All notable changes to `@uluops/setup` will be documented in this file.

## [0.6.0] - 2026-06-04

### Added

- **Optional global `@uluops/cli` install during setup.** New `--with-cli` flag forces install without prompting; `--no-cli` forces skip. With neither flag, interactive runs prompt (default Y) and non-interactive runs (`--yes`, `--api-key`, no TTY) skip silently. The install step is best-effort — if `npm install -g` fails (permissions, nvm prefix surprise, network), setup surfaces a warning with the one-line cause and a manual install command, but the overall flow does not abort. If `ulu` is already on PATH, the step detects it and makes no changes. `manifest.cliInstalled` records ownership, so `--uninstall` removes the global package only when this setup installed it.
- **LICENSE file (MIT).** Aligns the setup package with the open-tooling stance for SDKs/CLIs/installers (proprietary surfaces remain in analytics/platform/tier-gate). `package.json` license field updated to `"MIT"` to match.

### Fixed

- **`dist/commands/**` was missing from the `files` field.** `cli.js` imports `runSetup`, `runUninstall`, and `runVerify` from `./commands/*`, but the `files` array shipped only `dist/cli`, `dist/lib`, `dist/steps`, and `dist/harnesses`. The v0.5.0 tarball crashed on first invocation with `ERR_MODULE_NOT_FOUND` before any user-visible output. v0.5.0 was never published to npm, so no consumers were affected.

### Changed

- **All `dependencies` and `devDependencies` pinned to exact versions** — removed caret ranges across the board (`@inquirer/prompts`, `@uluops/agent-metrics`, `chalk`, `commander`, `jsonc-parser`, and all dev tooling). Aligns this package with the UluOps-wide exact-pinning policy adopted 2026-06-01 in response to the RedHat-class supply-chain attack pattern.

## [0.5.0] - 2026-05-29

### Added

- **`hooksInstalledVersion` field on `HarnessManifest`** — records the agent-metrics version copied into the harness tree. The shared version ledger across the setup↔agent-metrics seam that the Confucius forecaster named as the missing piece.
- **`HarnessInstanceKey` type alias on `Manifest.harnesses`** — documents that today's `{profile.name}` keying assumes one install per profile, and names where future multi-instance support would extend.
- **`HarnessStatus` field on `HarnessProfile` (`"stable" | "experimental"`)** — `detectHarnesses()` now excludes experimental profiles so auto-detection never returns a profile that throws `HarnessNotTestedError`. Codex marked experimental; Claude Code, Gemini CLI, OpenCode marked stable. `getProfile()` still resolves experimental profiles so `--harness <name>` surfaces the explicit error.
- **`CLAUDE_HOOK_TYPES` and `DEFAULT_CLAUDE_HOOK_TYPE` exported** with anchor tests that surface drift in PR review. When Claude Code's hook schema evolves, the snapshot tests fail and point at downstream surfaces needing re-evaluation.

### Changed

- **`@uluops/agent-metrics` moved from `optionalDependencies` to `dependencies`** — it was always required for the headline metrics-hook feature; the optionality was a runtime-level skip for harnesses without hook support, not a declaration-level optionality. `installMetrics` still gracefully skips for OpenCode/Codex.
- **`copyToolFiles` now `rm -rf`s `dist/` before copying** — replaces instead of merges. Stale files from a previous agent-metrics version no longer persist on disk to shadow new files.
- **`verify` now reads the installed agent-metrics version** and compares it to the manifest's `hooksInstalledVersion`. Existence-only check is gone; drift surfaces as a verify failure with the version delta in the detail string.
- **`ULUOPS_HOOK_MARKER` renamed to `HOOK_OWNERSHIP_SIGNATURE`** and its value changed from `"tools/agent-metrics"` (path-coupled) to `"agent-metrics/dist/hook.js"` (suffix-based, path-independent). Existing hook commands match the new signature because all real commands end with this suffix; the rename makes the path/sentinel separation explicit in the type.
- **`getBackupDir` JSDoc** now discloses that backups cover config files only, not tool files in `~/.claude/tools/agent-metrics/`.

### Tracker

- Closes 11 of 12 Confucius-pair findings on this package. The remaining one (metrics-terminology overspecialization) is deferred — speculative rename pending the SubagentStop hook actually gaining non-metric responsibilities.

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
