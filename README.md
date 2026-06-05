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
| Codex | Coming soon | — | `~/.codex/config.toml` |

```bash
# Install for Claude Code (default)
npx @uluops/setup

# Install for OpenCode
npx @uluops/setup --harness opencode

# Install for Gemini CLI
npx @uluops/setup --harness gemini-cli
```

## What it does

| Artifact | Count | Destination (Claude Code) |
|----------|-------|---------------------------|
| MCP servers | 2 | `~/.claude.json` |
| Agent definitions | 23 | `~/.claude/agents/` |
| Agent commands | 23 | `~/.claude/commands/agents/` |
| Workflow commands | 3 | `~/.claude/commands/workflows/` |
| Pipeline commands | 2 | `~/.claude/commands/pipelines/` |
| Agent metrics hook | 1 | `~/.claude/tools/agent-metrics/` |

> Paths shown are for Claude Code (default). Gemini CLI installs agents as `.md` and commands as `.toml` to `~/.gemini/`. OpenCode installs agents to `~/.config/opencode/agents/`. Agent definitions and commands are transformed to the target harness format at install time from a single source.

The installer runs these steps in sequence:

1. **Authenticate** — Validates your API key (or creates an account with `--signup`)
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

You'll be prompted for your API key (get one at [app.uluops.ai/settings/api-keys](https://app.uluops.ai/settings/api-keys)). Everything else uses smart defaults — no other prompts. See [What it does](#what-it-does) for the full list of changes made.

**New to UluOps?** Create an account without leaving the terminal:

```
npx @uluops/setup --signup
```

You'll be prompted for email and password. Account + API key are created automatically.

> **🛑 IMPORTANT:** You must restart your harness (e.g., restart Claude Code) after setup to load the new agents and commands.

### Options

```
npx @uluops/setup [options]

  --api-key <key>      API key (skip prompt)
  --harness <name>     Target harness: claude-code, opencode, gemini-cli, codex
                       Aliases: claude, oc, gemini (default: claude-code)
  --signup             Create account from terminal (email + password)
  --scope <mode>       MCP config scope: "global" or "local" (default: global)
  --local-defs         Save definitions to ./uluops/ for review
  --shell              Write API key export to shell profile
  --with-cli           Install @uluops/cli globally (skip prompt)
  --no-cli             Skip @uluops/cli install (skip prompt)
  --skip-validation    Accept API key without server verification
  --list               Show available agents and workflows without installing
  --verify             Check installation health: manifest, files, MCP config, API connectivity (no changes)
  --uninstall          Remove all UluOps-managed artifacts
  --dry-run            Show what would happen without making changes
  -y, --yes            Skip confirmations
```

### Advanced Commands

#### Preview available agents (`--list`)
Displays all agents and workflows included in the current version of the setup tool.

```text
  ⟨u⟩ ulu·ops v0.6.0 — available agents and workflows

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
  ⟨u⟩ ulu·ops Installation Check v0.6.0

  ✓ Manifest found (~/.uluops/manifest.json)
  ✓ All 23 agents present in ~/.claude/agents/
  ✓ MCP servers configured in ~/.claude.json
  ✓ API connectivity: Tracker (Online)
  ✓ API connectivity: Registry (Online)

  All checks passed.
```

### Examples

```bash
# New user — create account + install in one shot
npx @uluops/setup --signup

# Install for OpenCode
npx @uluops/setup --harness opencode

# Non-interactive (CI/automation)
npx @uluops/setup --api-key ulr_abc123 -y

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
npx @uluops/setup --uninstall
```

Removes only UluOps-managed files: agents, commands, MCP config entries, shell profile export (if `--shell` was used), and the global `@uluops/cli` package (only if this setup installed it — a CLI you installed yourself is left alone). Your custom agents and other MCP servers are preserved. Uninstall iterates all harnesses recorded in the manifest.

## Requirements

- **Node.js:** >= 20.0.0
- **Platform:** Linux, macOS, or WSL2 (native Windows not supported)
- **Harness:** Claude Code, OpenCode, or Gemini CLI
- **Auth:** UluOps API key ([get one here](https://app.uluops.ai/settings/api-keys))

---
**Global install:** If you prefer, install once with `npm i -g @uluops/setup` then run `uluops-setup`.
