# Changelog

All notable changes to `@uluops/setup` will be documented in this file.

## [0.7.1] - 2026-06-05

### Fixed

- **`@uluops/agent-metrics` global-install detection no longer false-positives under `npx`.** v0.7.0's `defaultAgentMetricsExecutor.detect` ran `spawnSync("agent-metrics", ["--version"])` to decide whether to skip the global install. But `@uluops/agent-metrics` is a runtime dependency of `@uluops/setup` itself (used by `findMetricsSource` to resolve files to copy), so when setup runs under `npx @uluops/setup`, npx prepends its transient cache `.bin/` to PATH for the spawned process — the bin resolves there even when the user has nothing installed globally. Detect returned "0.4.0", setup reported "already installed — no change", user hit `command not found` after npx exited. Detect now queries npm directly via `npm ls -g --depth=0 --json` and parses the result, answering the actual question ("is it in the user's global install") instead of a PATH-resolution proxy. Pure JSON-parsing logic split out as `parseGlobalAgentMetricsVersion` for direct unit coverage. 5 regression tests added covering: package-present, package-absent (empty + no-deps shapes), unrelated-deps-only, version-field-missing, and unparseable-stdout. The companion `@uluops/cli` flow does NOT have this bug because setup doesn't depend on `@uluops/cli` transitively; its detect is left as-is.

### Internal

- Suite: 223 → 228 tests (+5).

## [0.7.0] - 2026-06-05

### Added

- **Process-level install lock.** `runSetup` and `runUninstall` now acquire `~/.uluops/install.lock/` before touching shared state. A second concurrent `npx @uluops/setup` (or `uluops-setup --uninstall`) running on the same machine now fails fast with a clear message naming the holding PID, hostname, and how long it has been running — instead of silently racing the read-merge-write windows on `~/.claude.json`, `~/.gemini/settings.json`, `~/.config/opencode/opencode.json`, `~/.claude/settings.json`, `~/.bashrc`/`.zshrc`, and `~/.uluops/manifest.json` (six surfaces, not the one originally identified). Surfaced by ship-pipeline code-auditor as AF-006 on `uluops-setup` run #19. Hand-rolled around `mkdir`-atomicity — no new runtime dependency. Lock metadata `{pid, hostname, startedAt}` is written inside the lock dir; stale locks are reclaimed when the holding PID is detected as dead (same host) or when the lock is older than 30 minutes (cross-host fallback). SIGINT/SIGTERM/uncaughtException all release the lock before exit. Dry-run is read-only and bypasses the lock.
- **`agent-metrics` CLI prompt.** Setup now offers to install `@uluops/agent-metrics` globally so the `agent-metrics` command is available on PATH after install — previously the package was copied into `~/.claude/tools/agent-metrics/` only so the SubagentStop hook could invoke `dist/hook.js`, but the `bin` entry never reached PATH and users hit `command not found` when trying to inspect captures. The prompt fires only when the metrics hook itself was configured (i.e., when there are captures to read). New `--with-agent-metrics-cli` and `--no-agent-metrics-cli` flags mirror the existing `--with-cli` / `--no-cli` pair. Non-interactive runs (`--yes`, `--api-key`, no TTY) skip the prompt and require the explicit flag to install. Manifest gains `agentMetricsCliInstalled` + `agentMetricsCliInstalledVersion`; uninstall reverses the global install only when this setup performed it (same ownership rule as `@uluops/cli`).

### Known limitations

- **Setup-vs-harness races remain unaddressed.** This lock excludes other `uluops-setup` processes only. If the user is actively using Claude Code, Gemini CLI, or OpenCode while running setup, the harness CLI may write to its own state file (e.g. `~/.claude.json`) concurrently with our read-merge-write, and those harness writes can still be lost. A future spec will address this via content compare-and-swap on the merge target. Mitigation today: close the harness CLI before running setup.

### Internal

- New `src/lib/install-lock.ts` (~220 lines) with `acquireInstallLock`, `LockHandle.release()`, `InstallLockHeldError`, signal-handler registration, and a test seam for handler reset.
- New `src/lib/paths.ts:getInstallLockDir()` reusing `getUluopsDir()`.
- 11 unit tests in `src/test/install-lock.test.ts` covering acquire/release, fail-fast on held lock, stale-by-dead-PID, stale-by-timeout, stale-by-corrupt-meta, stale-by-missing-meta, `waitMs` polling success and timeout, idempotent release, and cross-host lock semantics.
- 1 integration test in `src/test/install-lock-integration.test.ts` spawning two real child `node` processes against the compiled dist — true OS-level concurrency serializes as expected.
- `src/cli.ts` formats `InstallLockHeldError` with a hint about stale-lock auto-recovery rather than emitting a stack trace.
- New `src/steps/agent-metrics-cli.ts` mirrors `src/steps/cli.ts` — `AgentMetricsCliExecutor` interface with `detect`/`install`/`uninstall`, `installAgentMetricsCli` + `uninstallAgentMetricsCli`, executor injection for tests.
- New `configureAgentMetricsCliStep` helper in `src/commands/helpers.ts` carries the decision matrix and user-facing prompt; `runSetup` invokes it after `configureMetricsStep`, gated on `metricsResult.hookConfigured`.
- 11 unit tests in `src/test/agent-metrics-cli.test.ts` covering install (already-present, success, failure, post-install detect miss, dryRun) and uninstall (absent, present, post-uninstall recovery, persistent failure, dryRun).
- Suite: 200 → 223 tests (+23 total for this release — 12 from install-lock + 11 from agent-metrics-cli).

## [0.6.5] - 2026-06-05

### Fixed

- **`.gitignore` no longer clobbered when `.gitignore` exists but cannot be read.** The previous `addToGitignore` (`src/steps/mcp.ts`) wrapped the `readFile` call in a bare `catch {}` that unconditionally wrote a single-line file. `ENOENT` was the intended trigger — the catch path exists to create `.gitignore` when it doesn't exist yet — but `EACCES`, `EISDIR`, `EBUSY`, and transient I/O errors were silently treated the same way, destroying any existing user content. The new `ensureGitignoreEntry` helper discriminates `err.code === "ENOENT"` for the fresh-write path and warns-and-skips on all other read errors. Surfaced by ship-pipeline code-auditor as AF-002 on `uluops-setup` run #19. The function is now exported from `src/steps/mcp.ts` with an injectable `reader` parameter so the non-ENOENT-no-clobber contract is directly testable.
- **Shell-profile fence handling now collapses duplicate UluOps blocks** left by earlier buggy installs. `writeShellExport` and `removeShellExport` in `src/steps/shell.ts` used `content.indexOf(FENCE_END)` (first occurrence) while a code comment at line 45 explicitly claimed "use last FENCE_END after FENCE_START to handle duplicates". The mismatch meant: (a) on re-install, the new block replaced only the first half of a duplicate-block region, leaving a stale block — and its stale `ULUOPS_API_KEY` export — sitting below the new one; (b) on uninstall, the second block was never removed. Both sites now use `content.lastIndexOf(FENCE_END)`. Surfaced by code-auditor as a SEM-INC/H finding.

### Internal

- New `ensureGitignoreEntry` tests in `src/test/mcp.test.ts` covering ENOENT (file creation), append-to-existing, idempotency on already-present entry, and the regression guard — non-ENOENT read failure must not clobber existing content.
- New `writeShellExport` and `removeShellExport` tests in `src/test/shell.test.ts` covering the duplicate-fence-block scenario for both install and uninstall.
- Suite now 200 cases (+12).

## [0.6.4] - 2026-06-05

### Fixed

- **`validateKey()` now hits the correct self-identity endpoint.** Server
  validation called `GET /api/v1/registry/users/me` — the registry-api's
  public user-lookup route, which Zod-validates the path param as a UUID and
  returns `400 { id: ["Invalid uuid"] }` for the literal `me`. Endpoint has
  been wrong since the initial `feat: implement @uluops/setup zero-friction
  installer` (commit `70a01a2`); users hit it any time they ran setup with a
  freshly-minted key and no `--skip-validation`. Now points at
  `GET /api/v1/auth/me` (ops-uluops-api) and unwraps the
  `{ data: { email, ... } }` envelope. Five regression tests added covering
  URL, header, response unwrap, 401 path, 500 path, and network-failure path.

### Changed

- **Stopped stamping backend URLs into MCP host configs.** Previously
  `mergeUluopsMcp` (Claude) and the OpenCode harness wrote
  `ULUOPS_BASE_URL: "https://api.uluops.ai/api/v1"` for `uluops-tracker` and
  `ULUOPS_REGISTRY_URL: "https://api.uluops.ai/api/v1/registry"` for
  `uluops-registry` into every generated config. Both URLs are already
  resolved automatically by `@uluops/ops-mcp` / `@uluops/registry-mcp` via
  their bundled SDKs (prod by default), so stamping was redundant — and
  worse, would pin every user to a static URL that could go stale if our
  production endpoints ever shifted. The generated `env` block now contains
  only `ULUOPS_API_KEY`. Pairs with `@uluops/ops-mcp@0.2.1` which made
  `ULUOPS_BASE_URL` officially optional on the consumer side.

## [0.6.3] - 2026-06-05

### Changed

- **Setup now auto-detects the installed harness** when `--harness` was not passed explicitly. Previously the detection logic ran but its result was discarded — every default invocation wrote Claude Code-shaped config regardless of what was actually present. A Gemini-CLI-only user running `npx @uluops/setup` from the landing page no longer ends up with an inert `~/.claude/` tree.
  - One harness detected → use it silently (no message for Claude Code to keep the common case quiet; a dim "Detected … — using as target" line for the other harnesses).
  - Multiple harnesses detected → interactive runs prompt with a `select`; non-interactive runs (`--yes`, `--api-key`, no TTY) default to the first match and print a hint about `--harness`.
  - No harnesses detected → fall back to `claude-code` (preserves the landing-page "just works" promise for fresh installs).
  - `--harness <name>` passed explicitly → always honored, detection is skipped.

## [0.6.2] - 2026-06-05

### Changed

- **New users now get an "Are you creating a new account?" prompt as the first interactive question** instead of being dropped straight into an API-key input box. Default Y. Picking Y runs the email + password signup flow; picking n falls through to the existing API-key prompt. Eliminates the friction where the landing-page instruction (`npx @uluops/setup`) hit new users with a key prompt before they had any idea where to get a key.
- The new prompt is skipped automatically when the user has already provided a signal about who they are: `--api-key`, `--signup`, `--yes`, `ULUOPS_API_KEY` set in env, no TTY attached, or `~/.uluops/credentials.json` already on disk. Returning users see zero new prompts.
- `--signup` is preserved as an explicit override (skips the question, goes straight to signup) — useful for CI scripts or anyone who wants to bypass the confirm step.

### Added

- **`hasCredentialsFile()` exported from `steps/auth.ts`** — existence-only probe for `~/.uluops/credentials.json` used by the prompt-skip gate.

## [0.6.1] - 2026-06-05

### Changed

- **MCP package names switched to scoped `@uluops/*` form.** Setup now writes `npx -y @uluops/ops-mcp` and `npx -y @uluops/registry-mcp` into harness configs (Claude Code, Gemini CLI, OpenCode) instead of the legacy `uluops-tracker-mcp-client` / `uluops-registry-mcp-client` names. The MCP server names in config (`uluops-tracker`, `uluops-registry`) are unchanged — every `mcp__uluops-tracker__*` reference across the agent corpus keeps working. Only the npm package resolved by `npx` differs.
- **`checkMcpPackageAvailability` updated** to probe the new package names against the npm registry. Users who run setup before the two MCP packages are published will see the warning name the actual missing packages.

## [0.6.0] - 2026-06-05

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
