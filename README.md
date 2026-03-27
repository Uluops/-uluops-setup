# @uluops/setup

Zero-friction installer for [UluOps](https://uluops.ai) + Claude Code. One command sets up MCP servers, agents, and slash commands.

```
npx @uluops/setup
```

## What it does

| Artifact | Count | Destination |
|----------|-------|-------------|
| MCP servers | 2 | `~/.claude.json` |
| Agent definitions | 22 | `~/.claude/agents/` |
| Slash commands | 27 | `~/.claude/commands/` |

The installer validates your API key, writes MCP config for the tracker and registry servers, copies pre-rendered agent and command definitions, and runs a health check against both APIs.

## Usage

```
npx @uluops/setup
```

You'll be prompted for your API key (get one at [app.uluops.ai/settings/api-keys](https://app.uluops.ai/settings/api-keys)). Everything else uses smart defaults — no other prompts.

**Restart Claude Code after setup to load agents.**

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
  --scope <mode>       MCP config scope: "global" or "local" (default: global)
  --local-defs         Save definitions to ./uluops/ instead of ~/.claude/
  --shell              Write API key export to shell profile
  --skip-validation    Accept API key without server verification
  --list               Show available agents and workflows without installing
  --verify             Check existing installation health (no changes)
  --uninstall          Remove all UluOps-managed artifacts
  --dry-run            Show what would happen without making changes
  -y, --yes            Skip confirmations
```

### Examples

```bash
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

# Check existing installation
npx @uluops/setup --verify

# Clean removal
npx @uluops/setup --uninstall
```

## What's included

### Workflows

| Command | Description |
|---------|-------------|
| `/workflows:pre-implementation` | Design review before coding |
| `/workflows:post-implementation` | Iterative validation loop |
| `/workflows:ship` | Final gate before shipping |
| `/workflows:prompt-audit` | Audit agent prompts |
| `/workflows:aristotle` | Four-phase Aristotelian analysis |

### Agents

| Command | Focus | Model |
|---------|-------|-------|
| `/agents:validate` | Code quality | sonnet |
| `/agents:type-safety` | TypeScript | sonnet |
| `/agents:test-review` | Test quality | sonnet |
| `/agents:optimize` | Performance | sonnet |
| `/agents:frontend` | React/a11y | sonnet |
| `/agents:mcp-validate` | MCP compliance | sonnet |
| `/agents:architect` | Design review | sonnet |
| `/agents:audit` | Runtime bugs | opus |
| `/agents:security` | OWASP | sonnet |
| `/agents:api-contract` | API alignment | sonnet |
| `/agents:release` | Publish ready | sonnet |
| `/agents:public-interface` | README/exports | sonnet |
| `/agents:docs-validate` | Documentation | sonnet |
| `/agents:prompt-validate` | Prompt review | sonnet |
| `/agents:prompt-quality` | Prompt quality | sonnet |
| `/agents:pattern-analyzer` | Patterns | sonnet |
| `/agents:aristotle-explorer` | Categories | opus |
| `/agents:aristotle-analyst` | Four causes | opus |
| `/agents:aristotle-validator` | Teleology | opus |
| `/agents:aristotle-forecaster` | Potentiality | opus |
| `/agents:assumption-excavator` | Assumptions | sonnet |
| `/agents:workflow-synthesis` | Cross-agent synthesis | opus |

> This is the starter set. Browse 135+ agents at [registry.uluops.ai](https://registry.uluops.ai).

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

A manifest at `~/.claude/uluops-manifest.json` tracks what was installed.

## Uninstall

```
npx @uluops/setup --uninstall
```

Removes only UluOps-managed files: agents, commands, MCP config entries, and shell profile export (if `--shell` was used). Your custom agents and other MCP servers are preserved.

## Requirements

- Node.js >= 18
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) installed
- UluOps API key ([get one here](https://app.uluops.ai/settings/api-keys))

> **Global install:** If you install globally with `npm i -g @uluops/setup`, the binary is `uluops-setup`.

## Platform support

| Platform | Status |
|----------|--------|
| Linux | Supported |
| macOS | Supported |
| WSL2 | Supported |
| Windows (native) | Not yet supported |
