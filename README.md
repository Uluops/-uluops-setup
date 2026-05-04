**[UluOps](https://uluops.ai)** · Operating Intelligence as Infrastructure

---

# @uluops/setup

Zero-friction installer for [UluOps](https://uluops.ai) agentic harnesses. One command sets up MCP servers, agents, and slash commands for Claude Code, OpenCode, and more.

```
npx @uluops/setup
```

## Supported harnesses

| Harness | Status | Alias | Config |
|---------|--------|-------|--------|
| Claude Code | Fully supported (default) | `claude` | `~/.claude.json` |
| OpenCode | Fully supported | `oc` | `~/.config/opencode/opencode.json` |
| Gemini CLI | Agents + Commands | `gemini` | `~/.gemini/settings.json` |
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

The installer runs five steps in sequence:

1. **Authenticate** — Validates your API key (or creates an account with `--signup`)
2. **MCP config** — Writes tracker and registry server entries to the harness config
3. **Definitions** — Copies pre-rendered agent definition files
4. **Metrics hook** — Configures a post-agent hook for automatic run capture (Claude Code only)
5. **Health check** — Verifies both API endpoints are reachable

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

**Restart your harness after setup to load agents.**

### API key resolution

The installer checks these sources in order:

1. `--api-key <key>` flag
2. `ULUOPS_API_KEY` environment variable
3. `~/.uluops/credentials.json` (existing CLI auth)
4. Interactive prompt

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
  --skip-validation    Accept API key without server verification
  --list               Show available agents and workflows without installing
  --verify             Check installation health: manifest, files, MCP config, API connectivity (no changes)
  --uninstall          Remove all UluOps-managed artifacts
  --dry-run            Show what would happen without making changes
  -y, --yes            Skip confirmations
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

# Preview what's included without installing
npx @uluops/setup --list

# Check existing installation (manifest + file presence + API connectivity)
npx @uluops/setup --verify

# Clean removal
npx @uluops/setup --uninstall
```

## What's included

### Agents & Workflows

Setup installs the starter set of agent and workflow slash commands. Run `npx @uluops/setup --list` to see what's included.

> Browse more agents, workflows, and pipelines at [registry.uluops.ai](https://registry.uluops.ai). Pipelines are available via the registry API and MCP tools — they are not installed locally.

### MCP servers

Both servers use `npx -y` so there's no global install required:

- **uluops-tracker** — Validation run tracking, issue management, analytics
- **uluops-registry** — Agent definition registry, versioning, rendering

## How updates work

Re-running `npx @uluops/setup` is safe and idempotent:

- Unchanged files are skipped (content hash comparison)
- Updated files are overwritten
- Removed definitions are cleaned up
- Your custom agents and non-UluOps MCP servers are never touched

Setup manages four surfaces: agent files, command files, MCP config entries, and the metrics hook. A manifest at `~/.uluops/manifest.json` tracks what was installed so `--uninstall` can cleanly reverse all changes. The manifest supports multiple harnesses — each gets its own installation state.

## Uninstall

```
npx @uluops/setup --uninstall
```

Removes only UluOps-managed files: agents, commands, MCP config entries, and shell profile export (if `--shell` was used). Your custom agents and other MCP servers are preserved. Uninstall iterates all harnesses recorded in the manifest.

## Requirements

- Node.js >= 20
- At least one supported harness installed (Claude Code or OpenCode)
- UluOps API key ([get one here](https://app.uluops.ai/settings/api-keys))

> **Global install:** If you install globally with `npm i -g @uluops/setup`, the binary is `uluops-setup`.

## Platform support

| Platform | Status |
|----------|--------|
| Linux | Supported |
| macOS | Supported |
| WSL2 | Supported |
| Windows (native) | Not yet supported |
