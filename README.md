**[UluOps](https://uluops.ai)** · The operations layer for agentic work

---

# @uluops/setup

Zero-friction installer for [UluOps](https://uluops.ai) agentic harnesses. One command sets up MCP servers, agents, and slash commands for Claude Code, OpenCode, and more.

```bash
npx @uluops/setup
```

> Requires **Node.js >= 22.12** ([full requirements](#requirements)).

> **⚠️ Windows Users:** Native Windows is not yet supported. Please use **WSL2 (Ubuntu)** and run the setup inside your WSL environment.

**Contents:** [Supported harnesses](#supported-harnesses) · [What it does](#what-it-does) · [Usage](#usage) · [Options](#options) · [Advanced commands](#advanced-commands) · [Examples](#examples) · [How updates work](#how-updates-work) · [Troubleshooting](#troubleshooting) · [Uninstall](#uninstall) · [Requirements](#requirements)

## Supported harnesses

Setup 0.20.0 bundles agent-metrics **0.12.1** for hook installation and pins
tracker MCP **0.34.0** and registry MCP **0.18.0** in generated configs. Tracker
MCP uses ops-sdk **7.1.0**; both MCP servers run on zod 4.6.7 and mcp-secure-server 0.1.1-security. Re-run setup to refresh existing configs and hook
files, then restart the affected MCP connections in your harness.

Optional global CLI installs resolve npm's current release when the CLI is
absent. Setup preserves an existing global CLI rather than upgrading it;
update existing `@uluops/cli` or `@uluops/agent-metrics` global installs with npm.

| Harness | Alias | Config | What setup installs |
|---------|-------|--------|---------------------|
| Claude Code | `claude` | `~/.claude.json` | MCP servers, agents, slash commands, metrics hook |
| OpenCode | `oc` | `~/.config/opencode/opencode.json` | MCP servers, agents |
| Gemini CLI | `gemini` | `~/.gemini/settings.json` | MCP servers, agents, slash commands, metrics hook |
| Codex | — | `~/.codex/config.toml` | MCP servers, agents, the `uluops-operator` skill (in place of slash commands) |

All four are stable targets; they differ in what each harness can load. Until 0.19.0 this table said "Fully supported" for every harness while setup printed "Commands not yet supported (coming soon)" for OpenCode and Codex.

> **Codex note:** the TOML writer seeds `approval_mode = "approve"` for every read-side MCP tool exported by `@uluops/ops-mcp` and `@uluops/registry-mcp` so interactive sessions don't surface an approval prompt on every `list_*`/`get_*`/`query_*` call. Write-side tools (`save_run`, `bulk_update_status`, `publish_definition`, etc.) are intentionally NOT pre-approved — Codex still asks before any state-changing operation. A re-install over a hand-tuned config (any `[mcp_servers.<server>.tools.*]` block present) preserves your customizations verbatim and skips the seed step.

> **Gemini CLI note:** setup writes `trust: true` on both UluOps server entries in `~/.gemini/settings.json`. Gemini CLI then skips its confirmation prompt for **every** tool on those servers, write-side tools included — unlike Codex above, where only read tools are pre-approved. That covers the tracker's 12 destructive tools (`delete_run`, `soft_delete_project`, `merge_issues`, …), which stay enabled unless `ULUOPS_ALLOW_DESTRUCTIVE=false` is set in the tracker server's `env` (setup does not set it). To be asked before tool calls, remove `"trust": true` from either entry; a re-run of setup writes it back.

```bash
# Install for Claude Code (default)
npx @uluops/setup

# Install for one specific harness
npx @uluops/setup --harness opencode
npx @uluops/setup --harness gemini-cli

# Install into every detected stable harness in a single run
npx @uluops/setup --all-detected

# Install into a specific subset (comma-separated)
npx @uluops/setup --harness claude-code,gemini-cli
```

### Harness auto-detection

If you don't pass `--harness` or `--all-detected`, setup probes your home directory for known harness install markers and picks a target:

- **One harness detected** — that harness is used as the target. A dimmed `Detected <Name>` line confirms the choice (suppressed when the detected harness is the default `claude-code`).
- **Multiple harnesses detected (interactive)** — you get a multi-select checkbox listing every detected harness, with **every option checked by default** so the "install everywhere" case is a single Enter press. Use space to toggle entries off:

  ```text
  ? Multiple harnesses detected. Which would you like to install into?
  ❯ ◉ Claude Code
    ◉ OpenCode
    ◉ Gemini CLI
  ```
- **Multiple harnesses detected (non-interactive — `--yes`, `--api-key`, piped stdin)** — to keep CI scripts predictable, this preserves earlier behavior: the first detected harness installs and a dimmed notice lists the others. CI users who want multi-install opt in explicitly with `--all-detected`.
- **No harnesses detected** — falls back to the default (`claude-code`) so `npx @uluops/setup` always does something useful on a fresh machine.

Passing `--harness <name>` always wins — auto-detection is skipped entirely. Auto-detection only returns harnesses marked stable; when a future harness ships as experimental, an explicit `--harness <name>` will remain the only way to opt in.

### Multi-harness install

`@uluops/setup` is a zero-friction installer for any agentic stack you have. When you've installed multiple harnesses on the same machine, one invocation can wire UluOps into all of them — once-per-run prompts (API key, signup, CLI install) run a single time across the whole batch.

```bash
# Install into every detected stable harness
npx @uluops/setup --all-detected

# Same thing, alternative form (--all-detected is the canonical name)
npx @uluops/setup --harness all

# Subset
npx @uluops/setup --harness claude-code,opencode

# Aliases work in the comma-separated list
npx @uluops/setup --harness claude,oc
```

Each harness gets its own per-section block in the summary:

```text
  Setup complete: 3 installed of 3 harnesses

  ✓ [Claude Code] installed (23 agents · 28 commands · metrics)
  ✓ [OpenCode] installed (23 agents)
  ✓ [Gemini CLI] installed (23 agents · 28 commands · metrics)

  Restart each of Claude Code, OpenCode, Gemini CLI to load agents.
```

**Failure isolation:** one harness failing does not abort the others. The failing harness lands as `✗ [<Name>] failed — <reason>` in the summary with a `Re-run: npx @uluops/setup --harness <name>` hint (plus `--scope local` / `--local-defs` when the run used them, so the re-run lands in the same place); siblings install cleanly. The process exits 1 when any harness failed operationally, 0 when every harness either succeeded or was declined at the conflict prompt (user choice is not failure).

**Partial state:** if a per-harness step throws after MCP succeeded (e.g., a `mkdir` permission error during the agents step), the manifest records what landed plus `partial: "<step>"` naming the failed step. `--verify` surfaces this with a `partial install — failed at "<step>"` warning so you know a re-run is needed.

## What it does

| Artifact | Count | Destination (Claude Code) |
|----------|-------|---------------------------|
| MCP servers | 2 | `~/.claude.json` |
| Agent definitions | 23 | `~/.claude/agents/` |
| Agent commands | 23 | `~/.claude/commands/agents/` |
| Workflow commands | 3 | `~/.claude/commands/workflows/` |
| Pipeline commands | 2 | `~/.claude/commands/pipelines/` |
| Agent metrics hook | 1 | `~/.claude/tools/agent-metrics/` |

> Paths shown are for Claude Code (default). Gemini CLI installs agents as `.md` and commands as `.toml` to `~/.gemini/`. OpenCode installs agents to `~/.config/opencode/agents/`. Codex installs agents as `.toml` to `~/.codex/agents/` and ships a single `uluops-operator` skill under `~/.codex/skills/` instead of slash commands. Agent definitions and commands are rendered for each harness from a single source when the package is built, and copied as-is at install time.

The installer runs these steps in sequence:

1. **Authenticate** — Asks whether you're creating a new account. New users sign up with email + password; returning users paste an API key. Skip the question with `--api-key`, `--signup`, `--yes`, or `ULUOPS_API_KEY`.
2. **Registry username** *(optional)* — Offers to set your registry username, the one-time prerequisite for creating or publishing definitions. Never forced: consumers who only run definitions don't need one, and non-interactive runs skip it silently unless `--username <name>` is supplied.
3. **MCP config** — Writes tracker and registry server entries to the harness config
4. **Definitions** — Copies pre-rendered agent definition files
5. **Metrics hook** — Configures a post-agent hook for automatic run capture (Claude Code and Gemini CLI). On Claude Code it registers the same command on `SubagentStart` and `SubagentStop`. The start event records which agent definition each subagent was spawned with, so saved runs carry each agent's own `definition_version`. A setup from before 0.14.0 is detected and upgraded on re-run.
6. **`ulu` CLI** *(optional)* — Offers to install `@uluops/cli` globally. Interactive runs are prompted (default Y); non-interactive runs skip unless `--with-cli` is passed. `--no-cli` always skips. The install is best-effort: if `npm install -g` fails (permissions, nvm prefix, etc.) the rest of setup still completes and a manual install command is printed.
7. **Health check** — Verifies both API endpoints are reachable

> When this setup installs the CLI, the install is recorded in the manifest so `--uninstall` removes it symmetrically. If the CLI was already on your PATH before running setup, it is left alone on uninstall.

## Usage

```bash
npx @uluops/setup
```

Setup will first ask whether you're creating a new UluOps account. Pick **Y** to sign up with an email and password (account + API key created automatically); pick **n** to paste an existing API key from [app.uluops.ai/settings/api-keys](https://app.uluops.ai/settings/api-keys). Everything else uses smart defaults — no other prompts. See [What it does](#what-it-does) for the full list of changes made.

> The account question is automatically skipped if you've already saved credentials, set `ULUOPS_API_KEY`, or passed `--api-key`/`--yes`/`--signup`. You can also pass `--signup` to skip the question and go straight to signup.

> **🛑 IMPORTANT:** You must restart your harness (e.g., restart Claude Code) after setup to load the new agents and commands.

### Options

```text
npx @uluops/setup [options]

  --api-key <key>      API key (skip prompt)
  --harness <value>    Target harness(es). Single name, comma-separated subset,
                       or "all" sentinel:
                         --harness claude-code
                         --harness claude-code,codex
                         --harness all
                       Names: claude-code, opencode, gemini-cli, codex
                       Aliases: claude, oc, gemini (default: every detected
                       stable harness; claude-code when none is detected)
  --all-detected       Install into every detected stable harness. Canonical
                       synonym for --harness all. Cannot be combined with
                       --harness <single-name> (fail-fast conflict error).
  --signup             Create account from terminal (email + password)
  --username <name>    Set your registry username without prompting (lowercase
                       slug, e.g. ulu-labs). One-time prerequisite for
                       creating/publishing definitions — optional if you only
                       run them. Non-interactive runs skip the username step
                       entirely unless this flag is passed.
  --scope <mode>       MCP config scope: "global" or "local" (default: global)
  --local-defs         Copy definitions into ./uluops/<harness>/ instead of
                       the harness's home directory
  --shell              Write API key export to shell profile
  --with-cli           Install @uluops/cli globally (skip prompt)
  --no-cli             Skip @uluops/cli install (skip prompt)
  --with-agent-metrics-cli
                       Install @uluops/agent-metrics globally (skip prompt)
  --no-agent-metrics-cli
                       Skip @uluops/agent-metrics install (skip prompt)
  --no-metrics         Skip the agent-metrics hook install (no hook
                       configured, no tool files copied). The downstream
                       @uluops/agent-metrics CLI prompt is also suppressed.
  --skip-validation    Accept API key without server verification
  --list               Show available agents and workflows without installing
  --verify             Check installation health: manifest, files, MCP config, API key (no changes)
  --uninstall          Remove UluOps-managed artifacts. Combine with --harness
                       <name>[,<name>] to uninstall from a subset only —
                       remaining harnesses (and global infrastructure like
                       @uluops/cli) are preserved. Plain --uninstall removes
                       everything (today's behavior).
  --dry-run            Show what would happen without making changes
  -y, --yes            Skip confirmations
```

### Advanced Commands

#### Preview available agents (`--list`)
Displays all agents and workflows included in the current version of the setup tool.

```text
  ⟨u⟩ ulu·ops v0.20.0 — available agents and workflows

  WORKFLOWS
    /workflows:post-implementation    Iterative validation workflow. Run af...
    /workflows:pre-implementation     Validates proposed design and archite...
    /workflows:prompt-audit           Comprehensive prompt audit with ecosy...

  AGENTS (run individually)                              MODEL
    /agents:anxiety-reader            Reads from the pos... sonnet
    /agents:architect                 Run Pre-Implementa... sonnet
    /agents:assumption-excavator      Surfaces implicit ... sonnet
    /agents:audit                     Deep runtime corre... sonnet
    /agents:docs-validate             Validates comprehe... sonnet
    /agents:security                  Run a static secur... sonnet
    ...
```

#### Check installation health (`--verify`)
Validates your current installation against the local manifest and checks your API key. (Sample from a 0.19.0 install; the row set is unchanged in 0.20.0.)

```text
  ⟨u⟩ ulu·ops Installation Check v0.19.0

  ✓ Manifest found (v0.19.0, installed 2026-10-25)
  ✓ [Claude Code] Readiness — Active (loaded)
  ✓ [Claude Code] MCP config present in ~/.claude.json (2 servers)
  ✓ [Claude Code] 23/23 agents in ~/.claude/agents
  ✓ [Claude Code] 28/28 commands
  ✓ [Claude Code] Agent metrics hook configured — v0.12.1
  ✓ API key valid (user: you@example.com) — key from ~/.uluops/credentials.json
  ✓ MCP packages resolvable on npm

  All checks passed.
```

> With multiple harnesses installed, `--verify` prints one `[<Harness>]` block per manifest entry.
>
> The API key is found the way install finds it: `ULUOPS_API_KEY` first, then `~/.uluops/credentials.json`. With no key in either place the row reads `⚠ API key check skipped` and does not fail the run. A key the server rejects fails it with the same remedy install gives. Before 0.19.0 the check read `ULUOPS_API_KEY` only and was left out silently without it.
>
> The metrics hook row fails when the installed hook files no longer match what setup recorded (they were changed outside setup), and passes with a note such as `v0.12.0 — this setup bundles v0.12.1; re-run setup to update` when a newer hook is available. When any check fails, `--verify` ends with the command that repairs each harness where it is installed, for example `npx @uluops/setup --harness claude-code --scope local --local-defs`.

### Examples

```bash
# Default — asks "creating a new account?" then either signs you up or
# prompts for an existing API key
npx @uluops/setup

# Skip the account question and go straight to signup
npx @uluops/setup --signup

# Set your registry username during setup (required to publish definitions)
npx @uluops/setup --username ulu-labs

# Install for OpenCode
npx @uluops/setup --harness opencode

# Install into every detected stable harness in one run
npx @uluops/setup --all-detected

# Install into a specific subset
npx @uluops/setup --harness claude-code,gemini-cli

# Non-interactive (CI/automation)
npx @uluops/setup --api-key ulr_abc123 -y

# CI multi-harness: explicit opt-in to all-detected
npx @uluops/setup --api-key ulr_abc123 --all-detected -y

# Local MCP config (project-scoped)
npx @uluops/setup --scope local

# Copy definitions into ./uluops/<harness>/ instead of the harness home
npx @uluops/setup --harness claude-code,gemini-cli --local-defs

# Skip the agent-metrics hook (no run capture, no hook tool files)
npx @uluops/setup --no-metrics

# Preview without changes while offline
npx @uluops/setup --dry-run --api-key ulr_abc123 --skip-validation

# Persist API key in shell profile (~/.zshrc, ~/.bashrc, etc.)
npx @uluops/setup --shell

# Install the ulu CLI globally alongside harness setup
npx @uluops/setup --with-cli

# Skip the CLI prompt entirely (interactive runs default to asking)
npx @uluops/setup --no-cli

# Install the agent-metrics CLI globally alongside the metrics hook
npx @uluops/setup --with-agent-metrics-cli

# Skip the agent-metrics CLI prompt entirely
npx @uluops/setup --no-agent-metrics-cli
```

## How updates work

Re-running `npx @uluops/setup` is designed to be safe to repeat:

- Unchanged files are skipped (content hash comparison)
- Updated files are overwritten
- Definitions no longer shipped are cleaned up
- Custom agents and non-UluOps MCP servers are left alone, with two known
  edges: a hook whose command *contains* the UluOps ownership marker (e.g. a
  hand-forked copy of our agent-metrics hook) is treated as ours and replaced
  on re-run, and a re-run that puts definitions somewhere else — switching
  `--local-defs` on or off, or running a local install from another project
  — starts a fresh tree. The previous tree stays on disk untracked, and setup
  warns naming it.
- **Local definitions are per harness** (`./uluops/<harness>/agents`, `commands/`,
  `skills/`), since 0.19.0. Before, every harness shared `./uluops/`, so the last
  harness installed overwrote the others' files and a subset uninstall removed
  files other harnesses still recorded. Re-running setup moves a harness out of
  the old shared tree and deletes its files there once no installed harness
  still records that tree; until then setup leaves it and names the harnesses
  still using it.
- **The project is the nearest directory upward with `.git` or `package.json`**
  (or `ULUOPS_PROJECT_ROOT`). Before 0.19.0 only the current directory and its
  parent were checked, so a local install run from deeper inside a repo landed
  in the subdirectory; re-running from there now targets the repo root, and
  setup warns that the old location is no longer tracked.

Setup manages five surfaces: agent files, command files, skill files (Codex), MCP config entries, and the metrics hook. A manifest at `~/.uluops/manifest.json` tracks what was installed so `--uninstall` can reverse it. The manifest supports multiple harnesses — each gets its own installation state. `--uninstall` leaves `~/.uluops/credentials.json` in place, because `@uluops/cli` and the SDKs read the same file.

## Troubleshooting

- **Agents not appearing:** Ensure you have restarted your harness (Claude Code, etc.) after running setup. For Claude Code, simply exit and restart the CLI.
- **MCP errors:** If the harness fails to start the MCP servers, ensure `npx` is available in your PATH. You can check your config at `~/.claude.json` or `~/.config/opencode/opencode.json`.
- **API key rejected:** Verify your key at [app.uluops.ai](https://app.uluops.ai). Behind a corporate proxy, note that setup's own API calls do **not** honor `HTTPS_PROXY` (Node's fetch ignores proxy env vars) — use `--skip-validation` to complete setup offline and verify the key later from a network that can reach `api.uluops.ai`.
- **`@uluops/cli` install warning:** If setup warns it could not install the CLI globally (EACCES, nvm prefix mismatch, network), the rest of setup still completes. Run `npm install -g @uluops/cli` yourself when convenient — once it's on your PATH, every subsequent `npx @uluops/setup` will see it and skip the install step.
- **Windows issues:** Remember that native Windows is not supported; you must run the installer and your harness within **WSL2**.

## Uninstall

```bash
# Uninstall everything (every harness in the manifest + globals + shell export)
npx @uluops/setup --uninstall

# Uninstall from a specific harness only — other harnesses + globals preserved
npx @uluops/setup --uninstall --harness opencode

# Uninstall from a comma-separated subset
npx @uluops/setup --uninstall --harness opencode,gemini-cli

# Same as no filter — uninstall everything
npx @uluops/setup --uninstall --all-detected
```

Removes only UluOps-managed files: agents, commands, MCP config entries, shell profile export (if `--shell` was used), and the global `@uluops/cli` package (only if this setup installed it — a CLI you installed yourself is left alone). Your custom agents and other MCP servers are preserved.

**Subset uninstall** (`--uninstall --harness <name>`) removes only the named harness(es) from the manifest and disk. Shared infrastructure (the global `@uluops/cli`, `@uluops/agent-metrics`, and the shell-profile export) is left in place because remaining harnesses still need it. The manifest is updated rather than deleted. A subset uninstall that names a harness not in the manifest fails fast with an error listing what IS in the manifest — no silent no-op.

## Data & privacy

The metrics hook (step 5) captures **agent execution metadata only** — token
counts, durations, model and agent names, and (from agent-metrics 0.12.0) the
version, path and content hash of the agent definition file that ran — into a
**local buffer** on your machine. The hook itself sends nothing anywhere: data reaches the UluOps
tracker only when a run is explicitly saved (by you, or by tooling you run).
Artifact content being validated is never stored — only validation results.

Validation run and issue data saved to the tracker is **retained
indefinitely by design** (the immutable forensics model); account and data
deletion is available on request. Full details:
[uluops.ai/privacy](https://uluops.ai/privacy).

Opt-outs: `--no-metrics` skips the hook install entirely; `--uninstall`
removes it later. If you're installing inside an organization, check your
org's telemetry policy before enabling the hook on shared projects.

## Requirements

- **Node.js:** >= 22.12.0 (setup refuses to run on anything older; Node 20 reached end of life on 2026-04-30)
- **Platform:** Linux, macOS, or WSL2 (native Windows not supported)
- **Harness:** Claude Code, OpenCode, Gemini CLI, or Codex
- **Auth:** UluOps API key ([get one here](https://app.uluops.ai/settings/api-keys))

---
**Global install:** If you prefer, install once with `npm i -g @uluops/setup` then run `uluops-setup`.
