# Changelog

All notable changes to `@uluops/setup` will be documented in this file.

## [0.8.0] - 2026-06-07

### Added

- **Multi-target install — one invocation, every detected harness.** `@uluops/setup` is positioned as the zero-friction installer for any agentic stack a user has. Before this release, a user with Claude Code + Codex + Gemini CLI on the same machine had to run setup three separate times, repeating the API-key resolution, signup decision, npm-availability probe, and health check on every invocation. That contradicted the positioning the moment a user had two harnesses. New CLI surface:
  - `--harness all` and `--all-detected` install into every detected stable harness in one run.
  - `--harness claude-code,codex` installs into a specific comma-separated subset.
  - Interactive multi-detection now uses a `@inquirer/prompts/checkbox` with every option checked by default — the "install everywhere" case is a single Enter press; uncheck entries with space to install into a subset.
  - Non-interactive multi-detection preserves today's first-detected behavior to keep CI scripts predictable; CI users opt in to multi-install explicitly with `--all-detected`.
  - `--harness <single-name> --all-detected` is a conflicting-flags error that fails fast with no state touched.
  - `--harness all` with zero detected falls back to the default (`claude-code`) so the landing-page "just run npx @uluops/setup" promise is preserved.
- **Per-target failure isolation.** One harness failing does not abort the others. The orchestrator splits each per-harness step into its own `try`/`catch`; a failing harness lands as `failed` (operational error) or `declined` (user-rejected conflict prompt) in the per-harness summary while siblings install cleanly. The new `HarnessManifest.partial` field records which step threw when a post-MCP-success step (agents, commands, skills, metrics) fails — earlier steps' file lists are preserved so `--verify` and `--uninstall` operate on honest state.
- **4-tier exit-code classifier (spec §7.5).** Exit 0 when every harness succeeded, every harness was declined, or the run was a no-op (user unchecked everything on the prompt). Exit 1 only when at least one harness failed operationally (EACCES, ENOSPC, parse error, etc.). User-rejected conflict prompts no longer poison the exit code — CI scripts wrapping `--harness all` only fail on actionable errors.
- **Multi-harness summary block with per-status icons.** New unified rendering in `src/lib/display.ts` produces a `[<Harness>] installed/failed/skipped` line per target with ✓/✗/⊘/⚠ icons, partial-state markers, and a per-failure `Re-run: npx @uluops/setup --harness <name>` hint. The combined restart instruction at the end names every successfully-installed harness. Single-harness runs preserve today's `Setup complete!` banner format exactly (regression baseline).
- **`--uninstall --harness <name>` filter (symmetric to install).** Uninstall now accepts the same syntax as install: single name, comma-separated subset, `all` sentinel, `--all-detected` synonym, with the same fail-fast flag-conflict detection. Subset uninstall removes only the named harnesses, updates the manifest in place (instead of deleting it), and **preserves shared infrastructure** — the global `@uluops/cli`, `@uluops/agent-metrics`, and shell-profile export are only removed on a full uninstall, since remaining harnesses still need them. Unknown harness in the filter fails fast with an error message listing what IS in the manifest so the user can correct typos.
- **`--verify` partial-install warning.** When the manifest records `partial: "<step>"` on a harness entry, verify surfaces a `[<Harness>] partial install — failed at "<step>"` row with a re-run hint. The per-file checks still run because the recorded lists are honest — the warning adds context about why a re-run is needed. Verify exits non-zero on partial state — partial isn't "passes", it's "incomplete".
- **Full Codex harness implementation** (lifted from scaffold to first-class support). Real TOML `mcp_servers` write/read/remove with nested table + env subtable handling, plus a skills install step delivering `ULUOPS_OPERATOR` under `~/.codex/skills`. Codex is still flagged `status: "experimental"` so it's excluded from `--all-detected` detection; opt in explicitly with `--harness codex`.

### Fixed

- **`installAgents.files` now tracks only successfully-copied files.** Previously returned the source `readdir` listing including failed files — so a failed copy ended up in `manifest.agents[]` even though the file was never on disk. Subsequent `--uninstall` would attempt to remove a never-written file (harmless but noisy), and `--verify` falsely reported drift. Aligned with `installCommands`/`installSkills` which already only push to their files lists inside the try-block. Prerequisite for the multi-target install partial-state contract (the manifest treats `agents`/`commands`/`skills` as the authoritative list of what's on disk; all three installers must honor that).
- **`src/cli/select-harnesses.ts` added to the package tarball.** The Phase 2 selection module was missing from `package.json`'s `files` glob — the unit suite imported from source so vitest passed, but the published tarball would have shipped a broken `cli.js` with an unresolvable `ERR_MODULE_NOT_FOUND` import. Caught by the docker test substrate on its first multi-target scenario run. Fixed by adding `dist/cli/**` to the `files` field.

### Internal

- **New module structure** for the multi-target orchestration:
  - `src/commands/per-harness.ts` — `PerHarnessResult` type + `classifyExit` 4-tier classifier (extracted from `setup.ts` so `display.ts` can import the type without circular dependency).
  - `src/commands/errors.ts` — typed `ConflictRejectedError` (replaces `process.exit(0)` in `checkConflicts` so the per-harness loop can catch and continue).
  - `src/cli/select-harnesses.ts` — pure selection logic for the §5 behavior matrix (prompt callback injected for testability; cli.ts wires the real `@inquirer/prompts/checkbox`).
  - `src/commands/uninstall-filter.ts` — pure filter parser + validator mirroring the install-side syntax.
- **`runSetup` restructured** into outer (once-per-run: `initContext`, install-lock, manifest load) and inner (per-harness: conflict check, MCP, agents, commands, skills, metrics) phases plus once-per-run-after globals (CLI install, agent-metrics CLI install gated on aggregate `anyHookConfigured`, health check, shell, single `saveManifest`). Each iteration reads its own slice of `existingManifest?.harnesses[harnessName]` for drift detection — no cross-iteration state reuse.
- **`HarnessManifest.partial?: PartialStep | null`** additive field with `isNewManifest` validation when present. Absent on pre-multi-target manifests (assumed fully installed). Re-runs against a partial entry re-prompt `checkConflicts` (gated on `existingHarness.partial == null`) so the safety check isn't bypassed on the recovery path.
- **Suite: 240 → 340 tests (+100):**
  - `src/test/select-harnesses.test.ts` (26) — every row of the §5 behavior matrix.
  - `src/test/per-harness.test.ts` (10) — every row of the §7.5 4-tier exit-code table.
  - `src/test/display-summary.test.ts` (10) — single-harness regression baseline + multi-harness mixed-outcome rendering + partial entry + all-declined + `maskKey` behavior; captures stdout, strips ANSI, asserts on substrings.
  - `src/test/uninstall-filter.test.ts` (16) — CLI matrix + conflict detection + unknown-harness validation + edge cases.
  - `src/test/verify.test.ts` (+2) — partial-install warning emitted; absent partial field does NOT emit the warning row.
  - `src/test/agents.test.ts` (+1 assertion) — failed file not in `installedFiles`.
- **Docker test substrate: 12 → 16 scenarios:**
  - `multi-all-detected` — 3 detected harnesses install in one invocation; manifest aggregates all three.
  - `multi-explicit-subset` — `--harness claude-code,codex` honors explicit list when 4 harnesses detected; user-typed order preserved; no cross-harness contamination.
  - `multi-flag-conflict` — `--harness codex --all-detected` exits non-zero, no state touched.
  - `multi-non-interactive-default` — CI compatibility: `--yes` + multi-detect preserves first-detected + dimmed notice.
  - `multi-harness-all-zero-detected` — `--harness all` with no detection falls back to claude-code.
  - `multi-mcp-fail-one` — sabotages opencode (pre-create `opencode.json` as a directory → EISDIR), asserts failure isolation: siblings install, exit 1, per-harness summary surfaces failure + re-run hint, opencode absent from manifest.
  - `multi-verify-partial` — installs, sabotages manifest to set `partial: "agents"` (with recomputed contentHash), runs `--verify`, asserts partial warning row + non-zero exit + per-file checks still ran.
  - `multi-uninstall-subset` — installs 3 harnesses, `--uninstall --harness opencode`, asserts opencode removed + others preserved + manifest updated (not deleted) + globals-preservation notice.
  - `multi-uninstall-unknown-harness` — install claude-code, `--uninstall --harness opencode`, asserts non-zero exit + error names unknown harness + lists manifest contents + state untouched.

### Breaking changes

- `runSetup` programmatic signature: `harness: string` → `harnesses: string[]`. The CLI is the only documented caller; internal callers (if any) need a one-line change to wrap their single-harness invocation in `[harnessName]`.

### Spec / process

This release ships against a specification authored and reviewed via the pre-implementation pipeline:
- **Spec:** `plans/multi-harness/setup-multi-target-install-spec-v0_1_0.md` (v0.2.2, Option A — multi-select checkbox + `--all-detected` + comma-split — locked in after pre-implementation pipeline produced architect / docs-validator / assumption-excavator reviews; persona-evidence claim was rewritten to ground in product-positioning consistency after the assumption-excavator surfaced the unsourced claim).
- **Checklist:** `plans/multi-harness/setup-multi-target-install-checklist-v0_2_1.md` tracks each phase with gates between them; every checked item maps to a commit on `feature/multi-target-install`.

## [0.7.1] - 2026-06-05

### Fixed

- **`@uluops/agent-metrics` global-install detection no longer false-positives under `npx`.** v0.7.0's `defaultAgentMetricsExecutor.detect` ran `spawnSync("agent-metrics", ["--version"])` to decide whether to skip the global install. But `@uluops/agent-metrics` is a runtime dependency of `@uluops/setup` itself (used by `findMetricsSource` to resolve files to copy), so when setup runs under `npx @uluops/setup`, npx prepends its transient cache `.bin/` to PATH for the spawned process — the bin resolves there even when the user has nothing installed globally. Detect returned "0.4.0", setup reported "already installed — no change", user hit `command not found` after npx exited. Detect now queries npm directly via `npm ls -g --depth=0 --json` and parses the result, answering the actual question ("is it in the user's global install") instead of a PATH-resolution proxy. Pure JSON-parsing logic split out as `parseGlobalAgentMetricsVersion` for direct unit coverage. 5 regression tests added covering: package-present, package-absent (empty + no-deps shapes), unrelated-deps-only, version-field-missing, and unparseable-stdout. The companion `@uluops/cli` flow does NOT have this bug because setup doesn't depend on `@uluops/cli` transitively; its detect is left as-is.
- **`--help` and `--uninstall` now work for users with a malformed `XDG_CONFIG_HOME`.** The opencode harness module previously ran a module-load IIFE that threw on a non-absolute or traversal-containing `XDG_CONFIG_HOME` — and the throw fired during `harnesses/index.ts` imports for every CLI entry point, blocking the user from running the very commands they would need to recover. Validation is now deferred to harness selection: the module loads with a fallback path, the error is captured, and `assertOpencodeEnvironment()` is invoked from `getProfile("opencode")` only when the user actually targets opencode. Selecting an unrelated harness (or running `--help`, `--uninstall` of claude-code, etc.) is now unblocked. Surfaced by ship-pipeline code-auditor on `uluops-setup` run #19 as PRA-CON/H.
- **`checkMcpPackageAvailability` now surfaces the real network failure reason** instead of a literal "unknown" string. The previous `?? "unknown"` fallback could put `unknown` into the missing-packages list, producing the unactionable warning `npm packages not found in registry: unknown`. Per-index correspondence between `Promise.allSettled` results and `MCP_PACKAGES` is now asserted directly; on rejection (DNS, timeout, TLS, etc.) the package name is annotated with `(network: <reason>)`, on non-2xx the bare package name is used. Surfaced as STR-INC/H.
- **Empty `harnesses: {}` is no longer accepted as a valid manifest.** `isNewManifest` previously iterated `Object.values(harnesses)` and vacuously returned `true` for the zero-entry case. A truncated/partial write produced a file that loaded "successfully" — then uninstall would iterate zero harness entries, delete the manifest, and report `UluOps has been removed` while leaving every MCP config, agent, hook, and shell export in place. `isNewManifest` now requires at least one harness entry. Surfaced as SEM-COM/H.
- **`validateManifest` no longer emits a false "Cannot read manifest file" warning when the manifest came from legacy.** `loadManifest` migrates a legacy manifest in memory without writing it back to the new location, but `validateManifest` hardcoded `getManifestPath()` (new) for the hash check — the read failed on every uninstall after migration, training users to ignore real corruption signals. The hash verification now reads whichever manifest file actually exists (new path tried first, legacy as fallback) and silently skips when neither is on disk. The "modified since installation" hash-mismatch warning is preserved for the genuine tamper case. Surfaced as SEM-INC/H.
- **`npm install -g` and `npm uninstall -g` now timeout after 5 minutes.** Both `defaultExecutor` (in `src/steps/cli.ts`) and `defaultAgentMetricsExecutor` (in `src/steps/agent-metrics-cli.ts`) called `spawnSync` without a `timeout` option. A corporate proxy stall, registry slow-response storm, or a lifecycle script awaiting input could block setup indefinitely with no recovery path other than `^C`. Both executors now use a 5-minute upper bound, and the `detect` paths use a 30-second bound. Timeout-driven SIGTERM produces a clear `npm install exceeded 300s timeout and was terminated` error instead of a misleading exit-code failure. Surfaced as SEM-COM/H.
- **Windows/WSL path resolution for `@uluops/agent-metrics`.** `findMetricsSource` in `src/steps/metrics.ts` accessed `new URL('.', resolved).pathname` to derive the package root from `import.meta.resolve`. On Windows (including WSL when a path surfaces through a Windows mount), `.pathname` yields `/C:/path/...` — the leading slash before the drive letter is invalid, the subsequent `readFile(pkgRoot/package.json)` fails, and `findMetricsSource` returns `null` with `version: null`, defeating verify's drift detection. Now uses `fileURLToPath(resolved)` from `node:url`, which handles drive letters correctly. Surfaced as SEM-COR/H.
- **`acquireInstallLock` now creates the parent `~/.uluops/` directory before the atomic lock-dir mkdir.** First-time users with no `~/.uluops/` on disk hit `ENOENT: no such file or directory, mkdir '/home/.../.uluops/install.lock'` from `acquireInstallLock` because the lock-dir mkdir uses `recursive: false` (intentional — `mkdir` atomicity is the lock primitive) and ENOENT on the missing parent is not the same as EEXIST on the lock itself. The parent is now pre-created with `recursive: true` while the lock-dir mkdir keeps its atomicity contract. Surfaced by the new `docker/scenarios/fresh-install.sh` substrate on its very first run against a clean WSL-shaped Ubuntu container — exactly the bug class that local `npm test` cannot reproduce because dev machines always have `~/.uluops/` from prior runs. Regression test pinned at `src/test/install-lock.test.ts`.

### Internal

- 17 new regression tests across the affected modules:
  - 5 for the `agent-metrics` detect fix (covering present/absent/unrelated-deps/missing-version/unparseable-stdout shapes of `npm ls -g --json`).
  - `src/test/config-merger.test.ts` — `checkMcpPackageAvailability` rejection-reason annotation + bare-package-name on registry miss (2 tests, mocked `fetch`).
  - `src/test/manifest.test.ts` — empty-harnesses rejection + legacy-only validate no-false-warning + hash-mismatch tamper detection (3 tests).
  - `src/test/cli.test.ts` — `summarizeSpawnResult` SIGTERM-timeout recognition + stderr-on-non-zero + clean-exit ok-path (3 tests, real subprocesses with tight timeouts).
  - `src/test/harnesses.test.ts` — opencode module-load no-throw under invalid XDG + `assertOpencodeEnvironment` throws on demand + claude-code selection unaffected (3 tests with `vi.resetModules`).
- `summarizeSpawnResult` exported as `@internal` from `src/steps/cli.ts` for direct test access to the timeout branch.
- `assertOpencodeEnvironment` exported from `src/harnesses/opencode.ts` and invoked from `getProfile` in the harness registry.
- 1 install-lock test for the missing-parent-dir regression on first-time users.
- Suite: 223 → 240 tests (+17).

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
