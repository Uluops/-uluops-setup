**[UluOps](https://uluops.ai)** · Operating Intelligence as Infrastructure

---

# @uluops/setup

Zero-friction installer for [UluOps](https://uluops.ai) agentic harnesses. One command sets up MCP servers, agents, and slash commands for Claude Code, OpenCode, and more.

```
npx @uluops/setup
```

> **⚠️ Windows Users:** Native Windows is not yet supported. Please use **WSL2 (Ubuntu)** and run the setup inside your WSL environment.

## Supported harnesses

| Harness | Status | Alias | Config |
|---------|--------|-------|--------|
| Claude Code | Fully supported (default) | `claude` | `~/.claude.json` |
| OpenCode | Fully supported | `oc` | `~/.config/opencode/opencode.json` |
| Gemini CLI | Fully supported | `gemini` | `~/.gemini/settings.json` |
| Codex | Fully supported | — | `~/.codex/config.toml` |

> **Codex note:** the TOML writer seeds `approval_mode = "approve"` for every read-side MCP tool exported by `@uluops/ops-mcp` and `@uluops/registry-mcp` so interactive sessions don't surface an approval prompt on every `list_*`/`get_*`/`query_*` call. Write-side tools (`save_run`, `bulk_update_status`, `publish_definition`, etc.) are intentionally NOT pre-approved — Codex still asks before any state-changing operation. A re-install over a hand-tuned config (any `[mcp_servers.<server>.tools.*]` block present) preserves your customizations verbatim and skips the seed step.

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
- **Multiple harnesses detected (interactive)** — you get a multi-select checkbox listing every detected harness, with **every option checked by default** so the "install everywhere" case is a single Enter press. Use space to toggle entries off.
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

```
  Setup complete: 3 installed of 3 harnesses

  ✓ [Claude Code] installed (23 agents · 28 commands · metrics)
  ✓ [OpenCode] installed (23 agents)
  ✓ [Gemini CLI] installed (23 agents · 28 commands · metrics)

  Restart each of Claude Code, OpenCode, Gemini CLI to load agents.
```

**Failure isolation:** one harness failing does not abort the others. The failing harness lands as `✗ [<Name>] failed — <reason>` in the summary with a `Re-run: npx @uluops/setup --harness <name>` hint; siblings install cleanly. The process exits 1 when any harness failed operationally, 0 when every harness either succeeded or was declined at the conflict prompt (user choice is not failure).

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

> Paths shown are for Claude Code (default). Gemini CLI installs agents as `.md` and commands as `.toml` to `~/.gemini/`. OpenCode installs agents to `~/.config/opencode/agents/`. Codex installs agents as `.toml` to `~/.codex/agents/` and ships a single `uluops-operator` skill under `~/.codex/skills/` instead of slash commands. Agent definitions and commands are transformed to the target harness format at install time from a single source.

The installer runs these steps in sequence:

1. **Authenticate** — Asks whether you're creating a new account. New users sign up with email + password; returning users paste an API key. Skip the question with `--api-key`, `--signup`, `--yes`, or `ULUOPS_API_KEY`.
2. **MCP config** — Writes tracker and registry server entries to the harness config
3. **Definitions** — Copies pre-rendered agent definition files
4. **Metrics hook** — Configures a post-agent hook for automatic run capture (Claude Code and Gemini CLI)
5. **`ulu` CLI** *(optional)* — Offers to install `@uluops/cli` globally. Interactive runs are prompted (default Y); non-interactive runs skip unless `--with-cli` is passed. `--no-cli` always skips. The install is best-effort: if `npm install -g` fails (permissions, nvm prefix, etc.) the rest of setup still completes and a manual install command is printed.
6. **Health check** — Verifies both API endpoints are reachable

> When this setup installs the CLI, the install is recorded in the manifest so `--uninstall` removes it symmetrically. If the CLI was already on your PATH before running setup, it is left alone on uninstall.

## Usage

```
npx @uluops/setup
```

Setup will first ask whether you're creating a new UluOps account. Pick **Y** to sign up with an email and password (account + API key created automatically); pick **n** to paste an existing API key from [app.uluops.ai/settings/api-keys](https://app.uluops.ai/settings/api-keys). Everything else uses smart defaults — no other prompts. See [What it does](#what-it-does) for the full list of changes made.

> The account question is automatically skipped if you've already saved credentials, set `ULUOPS_API_KEY`, or passed `--api-key`/`--yes`/`--signup`. You can also pass `--signup` to skip the question and go straight to signup.

> **🛑 IMPORTANT:** You must restart your harness (e.g., restart Claude Code) after setup to load the new agents and commands.

### Options

```
npx @uluops/setup [options]

  --api-key <key>      API key (skip prompt)
  --harness <value>    Target harness(es). Single name, comma-separated subset,
                       or "all" sentinel:
                         --harness claude-code
                         --harness claude-code,codex
                         --harness all
                       Names: claude-code, opencode, gemini-cli, codex
                       Aliases: claude, oc, gemini (default: claude-code)
  --all-detected       Install into every detected stable harness. Canonical
                       synonym for --harness all. Cannot be combined with
                       --harness <single-name> (fail-fast conflict error).
  --signup             Create account from terminal (email + password)
  --scope <mode>       MCP config scope: "global" or "local" (default: global)
  --local-defs         Install definitions into ./uluops/ (project-scoped)
                       instead of the harness's home directory
  --shell              Write API key export to shell profile
  --with-cli           Install @uluops/cli globally (skip prompt)
  --no-cli             Skip @uluops/cli install (skip prompt)
  --no-metrics         Skip the agent-metrics hook install (no hook
                       configured, no tool files copied). The downstream
                       @uluops/agent-metrics CLI prompt is also suppressed.
  --skip-validation    Accept API key without server verification
  --list               Show available agents and workflows without installing
  --verify             Check installation health: manifest, files, MCP config, API connectivity (no changes)
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
  ⟨u⟩ ulu·ops v0.8.1 — available agents and workflows

  WORKFLOWS
  /workflows:post-implementation   Iterative validation after coding
  /workflows:pre-implementation    Design validation before implementation
  /workflows:prompt-audit          Strategic prompt quality audit

  AGENTS (run individually)                          MODEL
  /agents:code-validator           Validate cod...  sonnet
  /agents:type-safety              Deep TypeScr...  sonnet
  /agents:security-analyst         Comprehensiv...  sonnet
  /agents:test-architect           Validate tes...  sonnet
  ...
```

#### Check installation health (`--verify`)
Validates your current installation against the local manifest and checks API connectivity.

```text
  ⟨u⟩ ulu·ops Installation Check v0.8.1

  ✓ Manifest found (~/.uluops/manifest.json)
  ✓ All 23 agents present in ~/.claude/agents/
  ✓ MCP servers configured in ~/.claude.json
  ✓ API connectivity: Tracker (Online)
  ✓ API connectivity: Registry (Online)

  All checks passed.
```

### Examples

```bash
# Default — asks "creating a new account?" then either signs you up or
# prompts for an existing API key
npx @uluops/setup

# Skip the account question and go straight to signup
npx @uluops/setup --signup

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

# Preview without changes
npx @uluops/setup --dry-run --api-key ulr_abc123

# Persist API key in shell profile (~/.zshrc, ~/.bashrc, etc.)
npx @uluops/setup --shell

# Install the ulu CLI globally alongside harness setup
npx @uluops/setup --with-cli

# Skip the CLI prompt entirely (interactive runs default to asking)
npx @uluops/setup --no-cli
```

## How updates work

Re-running `npx @uluops/setup` is safe and idempotent:

- Unchanged files are skipped (content hash comparison)
- Updated files are overwritten
- Removed definitions are cleaned up
- Your custom agents and non-UluOps MCP servers are never touched

Setup manages four surfaces: agent files, command files, MCP config entries, and the metrics hook. A manifest at `~/.uluops/manifest.json` tracks what was installed so `--uninstall` can cleanly reverse all changes. The manifest supports multiple harnesses — each gets its own installation state.

## Troubleshooting

- **Agents not appearing:** Ensure you have restarted your harness (Claude Code, etc.) after running setup. For Claude Code, simply exit and restart the CLI.
- **MCP errors:** If the harness fails to start the MCP servers, ensure `npx` is available in your PATH. You can check your config at `~/.claude.json` or `~/.config/opencode/opencode.json`.
- **API key rejected:** Verify your key at [app.uluops.ai](https://app.uluops.ai). If you are behind a corporate proxy, you may need to set `HTTPS_PROXY`.
- **`@uluops/cli` install warning:** If setup warns it could not install the CLI globally (EACCES, nvm prefix mismatch, network), the rest of setup still completes. Run `npm install -g @uluops/cli` yourself when convenient — once it's on your PATH, every subsequent `npx @uluops/setup` will see it and skip the install step.
- **Windows issues:** Remember that native Windows is not supported; you must run the installer and your harness within **WSL2**.

## Uninstall

```
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

## Requirements

- **Node.js:** >= 20.0.0
- **Platform:** Linux, macOS, or WSL2 (native Windows not supported)
- **Harness:** Claude Code, OpenCode, or Gemini CLI
- **Auth:** UluOps API key ([get one here](https://app.uluops.ai/settings/api-keys))

---
**Global install:** If you prefer, install once with `npm i -g @uluops/setup` then run `uluops-setup`.
