# @uluops/setup test substrate

Disposable Docker harness for reproducing fresh-OS `npx @uluops/setup`
behavior — the execution context that `npm test` cannot exhibit because
of npx's transient-cache PATH semantics. The 0.7.0 → 0.7.1 agent-metrics
regression that survived the unit suite is the prototype bug class this
exists for.

## Why this exists (read this first)

Several classes of `@uluops/setup` bugs only surface when setup is run via
`npx`, on a clean OS, by a non-root user. The unit suite catches none of
them because:

- **npx-transient PATH:** when a user runs `npx @uluops/setup`, npx fetches
  the setup package and its transitive deps into a temporary cache, then
  prepends that cache's `.bin/` to PATH for the spawned process. Any
  `spawnSync("some-bin", ["--version"])` from inside setup sees that
  ephemeral PATH — not the user's real PATH. This is what bit 0.7.0's
  `agent-metrics` detect heuristic.
- **Per-user npm prefix:** real users on WSL/macOS typically have a
  per-user npm prefix (NVM, fnm, or `npm config set prefix`). `npm install -g`
  goes there, not to system locations. Local dev machines running
  `npm test` test against mocked executors, so this never gets exercised.
- **Fresh-state assumptions:** `~/.claude/`, `~/.uluops/`, `~/.claude.json`,
  shell profiles — setup reads-merges-writes all of them. Local dev machines
  always have residue from previous runs.

This substrate gives a clean WSL-shaped Ubuntu with a per-user npm prefix,
the Claude Code CLI installed, and a non-root user. Every scenario runs in
a `docker run --rm` so state never carries between runs.

## When to reach for this

| Situation | Use this? |
|---|---|
| Unit test for pure logic (no spawn/network/fs side effects) | ❌ — write a vitest |
| Integration test mocking spawn | ❌ — vitest with `vi.mock` |
| Verifying a setup-flow change before npm publish | ✅ |
| Reproducing a user-reported "command not found" or "manifest weirdness" | ✅ |
| Anything involving npx, real `npm install -g`, or PATH semantics | ✅ |
| Testing claude-code harness detection on a clean OS | ✅ |
| Testing the install-lock concurrency behavior | ⚠️ — possible but requires bg-spawn in scenario; vitest's integration test covers OS-level concurrency more cheaply |

The rule of thumb: if the bug only manifests when the binary actually
runs on a real PATH, use this. If it's logic that can be exercised by
calling a function, use vitest.

## Quick start

Prerequisites: Docker Desktop running (macOS: open the app; WSL: `systemctl --user start docker-desktop`).

```bash
cd packages/-uluops-setup
docker/test.sh                       # default scenario (fresh-install)
docker/test.sh agent-metrics-cli     # by name
docker/test.sh uninstall-roundtrip
docker/test.sh shell                 # interactive — tarball mounted, poke around
```

First run takes ~3 minutes (apt + Node + Claude Code CLI install in image
build). Every subsequent run is ~5–10 seconds: `npm run build` + `npm pack` +
`docker run --rm`.

## The iteration loop

```
1. Edit src/...
2. docker/test.sh <scenario>
3. Read pass/fail line at the bottom
4. If failed: docker/test.sh shell  ── reproduce manually, poke around
5. Fix → goto 2
```

Each `test.sh` invocation:
1. Runs `npm run build` in the package
2. Runs `npm pack` (produces a one-shot tarball, cleaned up on exit)
3. `docker build -q` (cache hit on every call after the first — instant)
4. `docker run --rm` mounting the tarball at `/pkg/setup.tgz` and scenarios
   at `/scenarios/`
5. Executes `/scenarios/<name>.sh` as user `tester`

The tarball is generated fresh every run so there's no stale-build risk.
Scenarios are bind-mounted, not baked in — edits to a scenario take effect
on the next `test.sh` call with no image rebuild.

## Why tarball mounts (not Verdaccio)

`npx <tarball>` and `npx @scope/pkg` share npx's cache + transient-PATH
mechanics. The bug class we care about reproduces either way. Tarball
mounts eliminate:

- Verdaccio binding/network config (host vs container reachability)
- Per-iteration `npm version` bump + `npm publish` round-trip
- Verdaccio cache-staleness when republishing at the same version

If a future bug class requires testing the actual npm-registry resolution
path (e.g., dist-tag selection, semver-range resolution), reintroduce
Verdaccio at that point. For now, tarball is the lowest-friction option.

## Image contents

- Ubuntu 24.04
- Node 22.x (via NodeSource)
- `@anthropic-ai/claude-code` (system-wide; provides `claude` on PATH)
- `opencode-ai` (system-wide; provides `opencode` on PATH)
- `@google/gemini-cli` (system-wide; provides `gemini` on PATH)
- Non-root user `tester` (uid 1000)
- Per-user npm prefix at `/home/tester/.npm-global/` (in `PATH`, `NPM_CONFIG_PREFIX`,
  and `.profile`/`.bashrc` for login + interactive shells)

Claude Code, OpenCode, and Gemini CLIs are installed system-wide as root
during image build, so `claude`, `opencode`, and `gemini` are on PATH for
`tester` without per-user setup. But harness **detection** keys off
`existsSync(profile.paths.home)` (see `src/harnesses/index.ts:72`), so:

- Claude Code: detection requires `~/.claude/` to exist
- OpenCode: detection requires `$XDG_CONFIG_HOME/opencode/` (defaults to
  `~/.config/opencode/`)
- Gemini CLI: detection requires `~/.gemini/` to exist

Scenarios that want a specific branch:
- "Detected" → `mkdir -p` the relevant home dir before running setup
- "No harness detected → fall back to claude-code default" → leave all absent
- "Specific harness regardless of state" → pass `--harness claude-code`,
  `--harness opencode`, or `--harness gemini-cli` explicitly

The per-user npm prefix matters: without it, `npm install -g` would EACCES
under `tester` and we couldn't distinguish "setup's install logic is broken"
from "container env is broken." See the Dockerfile comments for the rationale.

## Existing scenarios

### Claude Code

| Scenario | Asserts |
|---|---|
| `fresh-install` | npx setup succeeds on a clean OS; agents/commands/manifest appear |
| `agent-metrics-cli` | Regression guard for CHANGELOG [0.7.1] — `agent-metrics` is on PATH in a **new** shell spawned after the npx process exits |
| `uninstall-roundtrip` | Setup-owned state goes on uninstall; user-owned files (sentinel agent, third-party MCP entry) survive |

### OpenCode

| Scenario | Asserts |
|---|---|
| `opencode-fresh-install` | Pre-creates `~/.config/opencode/` to fire detection; runs setup `--harness opencode`; asserts opencode-shaped MCP config (`mcp` key not `mcpServers`, `type: "local"`, `command` as list, `environment` not `env`); asserts agents land in `~/.config/opencode/agents/`; asserts no `~/.claude/` contamination |
| `opencode-uninstall-roundtrip` | Install → assert merge (sentinel agent + third-party MCP preserved); uninstall → assert setup-owned state removed while user-owned state survives, in the opencode-shaped config |

### Gemini CLI

| Scenario | Asserts |
|---|---|
| `gemini-fresh-install` | Pre-creates `~/.gemini/` to fire detection; runs setup `--harness gemini-cli`; asserts Gemini-shaped MCP config (`mcpServers` key like Claude, but each server has `trust: true`); asserts hooks installed with `AfterTool` event + `invoke_agent` matcher (different from Claude's `SubagentStop`); asserts agents + commands + metrics tools all under `~/.gemini/`; asserts no `~/.claude/` or `~/.config/opencode/` contamination |
| `gemini-uninstall-roundtrip` | Install with planted user sentinel + third-party MCP entry + user-owned `AfterTool` hook with matcher `user-custom`; assert merge correctness (uluops's `trust:true` server added, third-party preserved, user hook preserved); uninstall; assert setup-owned state (mcp entries, uluops hook, metrics tools dir) removed while user-owned state (sentinel agent, third-party MCP, user-custom hook) survives |

### Multi-target install (`--all-detected`, `--harness all`, comma-split)

Validates the Phase 1/2 multi-harness orchestration end-to-end against a clean-OS container — the path no unit test can fully cover because npx-transient PATH + per-user npm prefix + fresh-state assumptions all interact.

| Scenario | Asserts |
|---|---|
| `multi-all-detected` | Pre-creates 3 harness home dirs (claude-code, opencode, gemini-cli) so detection fires; runs `--all-detected`; asserts all three install in ONE invocation; asserts `Multi-harness run: 3 installed of 3` aggregate summary appears; asserts per-harness `▸ <DisplayName>` section labels appear once each (no double-execution of once-per-run steps); asserts manifest contains entries for all three harnesses, all with `partial: null` |
| `multi-explicit-subset` | Pre-creates 4 harness home dirs to make detection greedy; runs `--harness claude-code,codex`; asserts only the two named harnesses install despite opencode + gemini also being detected (explicit overrides detection); asserts user-typed order honored in section ordering (claude-code section precedes codex); asserts opencode + gemini state untouched (no cross-harness contamination); asserts manifest has exactly the two requested entries |
| `multi-flag-conflict` | Runs `--harness codex --all-detected` (incompatible flags); asserts exit code non-zero; asserts error message names both the conflict and the offending `--harness` value; asserts NO state was touched (`~/.uluops/`, `~/.claude/`, `~/.codex/` all absent post-run — fail-fast before any install work) |
| `multi-non-interactive-default` | Pre-creates 3 harness home dirs; runs with `--yes` and no `--harness`/`--all-detected`; asserts spec §10.1 CI compatibility: only the first detected (claude-code) installs; asserts dimmed notice surfaces the others and hints at `--all-detected`; asserts opencode/gemini state untouched; asserts NO aggregate summary line (single-harness run) |
| `multi-harness-all-zero-detected` | No harness home dirs; runs `--harness all`; asserts the landing-page fallback fires (claude-code installs as the default); asserts only one section label appears; asserts manifest contains only claude-code |
| `multi-mcp-fail-one` | Pre-creates 3 harness home dirs + sabotages opencode by creating `~/.config/opencode/opencode.json` AS A DIRECTORY (forcing EISDIR on the MCP write); asserts Phase 3 failure isolation: claude-code + gemini-cli install cleanly while opencode lands as `failed`; asserts exit code 1 (operational failure per the 4-tier classifier); asserts the per-harness summary surfaces the failure with re-run hint; asserts the restart instruction lists only the successful harnesses; asserts opencode is absent from the manifest (pre-MCP failure → no entry) |

These scenarios uncovered a packaging bug during initial run: `src/cli/select-harnesses.ts` (Phase 2 addition) was missing from the `files` field in `package.json`, so the published tarball would have shipped a broken `cli.js` with an unresolvable import. The unit suite couldn't catch this because it imports from source, not from the packed tarball — exactly the bug class this substrate exists to surface. Fixed by adding `dist/cli/**` to the `files` glob in the same commit that introduced the scenarios.

OpenCode-specific gotcha pinned by these scenarios: as of setup 0.7.1,
commands are NOT installed for OpenCode — setup prints "Commands not yet
supported for OpenCode (coming soon)" and skips the dir, but the
`opencode.ts` profile still defines `commandsDir`. The scenarios assert
present behavior; if commands ship for OpenCode later, the fresh-install
scenario will print a `NOTE:` line prompting an update.

## Adding a scenario

Drop a new `scenarios/<name>.sh`. The driver finds it by filename. No image
rebuild required.

```bash
#!/usr/bin/env bash
set -euo pipefail

cd /home/tester
[ "$(cat ~/.uluops-test-marker)" = "uluops-setup-test-container" ]

# 1. Pre-conditions (clean state, planted sentinels, etc.)

# 2. Run setup
npx --yes /pkg/setup.tgz \
  --api-key=ulr_fake_test_key_000000000000000000 \
  --skip-validation \
  --yes \
  <flags-under-test>

# 3. Assert post-conditions
[ -d "$HOME/.claude/agents" ] || { echo "FAIL: ..."; exit 1; }

echo "OK: <one-line summary>"
```

Conventions:
- Always assert the sanity sentinel first — if the marker is missing, the
  script is running in someone's host shell and the assertions are dangerous
- Use `--api-key=ulr_fake_...` + `--skip-validation` so scenarios don't
  hit `api.uluops.ai` (the container has no network policy stub)
- `--yes` auto-confirms inquirer prompts; pair with explicit `--with-cli` /
  `--with-agent-metrics-cli` or `--no-cli` / `--no-agent-metrics-cli` so the
  scenario's intent is in the script, not in the prompt defaults
- For regression scenarios, leave a comment naming the CHANGELOG entry the
  scenario guards so future-us knows why it exists
- Print `OK: <summary>` on pass, `FAIL: <why>` on fail — the driver greps
  for these implicitly via exit code

## Troubleshooting

**"failed to connect to the docker API" / "Docker daemon is not reachable"** —
no Docker daemon backend is running (or installed). The Docker CLI on its
own tells you nothing on macOS — you need one of:
- **OrbStack** — `brew install --cask orbstack && open -a OrbStack`. Fastest
  on Apple Silicon; free for personal use. **The current setup uses this.**
- **Colima** — `brew install colima && colima start`. Headless, FOSS.
- **Docker Desktop** — install from docker.com.
`test.sh` runs a `docker info` preflight and prints install/start guidance
when the daemon is unreachable, so this should be friendly to hit cold.

**Image build hangs at `apt-get install`** — corporate proxy or NodeSource
hiccup. Try `docker build --no-cache docker/` to bypass any half-pulled
layers, or pin to a different Node major in the Dockerfile.

**`npm pack` produces an unexpected tarball name** — check `package.json`'s
`name` and `version`. `test.sh` uses `npm pack --silent | tail -n1` to
capture the produced filename, so any non-tarball stdout from npm
(deprecation notices, audit nag) breaks it. Hasn't happened yet, but if it
does, switch to a directory-scoped `--pack-destination` and a deterministic
filename.

**Scenario passes but the real bug still ships** — the scenario doesn't
actually cover the bug class. Look at the assertions: are they checking
state that the bug would change? The 0.7.0 bug passed all unit tests
because the asserted state ("installed: true") was the same in both the
bug and non-bug cases. The container scenario asserts on `command -v
agent-metrics` in a **fresh shell** specifically because that's the
discriminator the unit test couldn't capture.

**Live scenarios can be slow to debug** — drop into `docker/test.sh shell`
and re-run the scenario interactively:
```
docker/test.sh shell
# inside the container:
bash /scenarios/agent-metrics-cli.sh
```

## Limitations and known sharp edges

- No network calls to `api.uluops.ai` — every scenario passes
  `--skip-validation`. Auth/validation paths are covered by the unit suite
  with mocked fetch.
- The image bakes in a specific Claude Code version. To test against a
  different version, edit the Dockerfile and rebuild (`docker/test.sh`
  will rebuild on cache miss). If you need multiple Claude Code versions
  in flight, use `IMAGE_TAG=test:cc-v1.2 docker/test.sh`.
- Linux-only at runtime by design — covers the WSL distribution channel
  that is the primary user surface for the bug class. For macOS-specific
  behavior, you'd need a different substrate (and macOS-specific bugs
  haven't been observed yet).
- No coverage of failure-injection paths yet (post-MCP step throws,
  EACCES on a single harness in a multi-target run) — Phase 3 of the
  multi-target install spec adds these alongside the 4-tier exit-code
  classifier. The current multi-target scenarios cover the happy paths
  only; failure-isolation will need scenarios that plant pre-conditions
  causing one harness to fail (e.g., `chmod 000 ~/.config/opencode/`)
  while siblings succeed.
- Cleanup on Ctrl-C: the `trap` in `test.sh` removes the tarball even on
  interrupt. The container is `--rm` so it dies cleanly. But if you kill
  `test.sh` between `docker build` and `docker run`, you can be left with
  a dangling image — `docker image prune` cleans those up.

## Files

- `Dockerfile` — image definition
- `test.sh` — driver (build → pack → docker run)
- `scenarios/*.sh` — test scenarios (one per file)
- `README.md` — this document
