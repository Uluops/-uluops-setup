# Plan: `@uluops/setup` — Zero-Friction Installer

## Context

Users currently need 5+ manual steps to set up UluOps with Claude Code: install 2 MCP server packages, configure `.mcp.json` with correct paths/env vars, render 66 agent YAML definitions to `~/.claude/agents/`, copy 86 command + 9 workflow definitions to `~/.claude/commands/`, and set up their API key. This is error-prone and undocumented. We need a single command that does everything: `npx @uluops/setup`.

## Free Tier Scope

The setup package installs a curated subset — enough to experience the full ecosystem without giving away everything. Users get 4 workflows, 1 pipeline, and their constituent agents.

### Workflows & Pipeline Included

| Workflow/Pipeline | Agents Used |
|-------------------|-------------|
| **pre-implementation** | pre-implementation-architect, docs-validator (conditional) |
| **post-implementation** | code-validator, type-safety-validator, mcp-validator, test-architect, code-optimizer, public-interface-validator, frontend-validator |
| **ship** | code-validator, type-safety-validator, test-architect, public-interface-validator, code-auditor, security-analyst, api-contract-validator, release-readiness-validator |
| **prompt-audit** | prompt-pattern-analyzer, prompt-engineer, prompt-quality-validator |
| **aristotle-pipeline** | aristotle-explorer, aristotle-analyst, aristotle-validator, aristotle-forecaster, workflow-synthesis |

### Standalone Agents (not in a workflow)

- **assumption-excavator** — Surfaces implicit assumptions in any artifact

### Complete Agent Inventory (22 unique agents)

| # | Agent | Category |
|---|-------|----------|
| 1 | pre-implementation-architect | Pre-impl |
| 2 | docs-validator | Pre-impl |
| 3 | code-validator | Core validator |
| 4 | type-safety-validator | Core validator |
| 5 | mcp-validator | Core validator |
| 6 | test-architect | Core validator |
| 7 | code-optimizer | Core validator |
| 8 | public-interface-validator | Core validator |
| 9 | frontend-validator | Core validator |
| 10 | code-auditor | Ship gate |
| 11 | security-analyst | Ship gate |
| 12 | api-contract-validator | Ship gate |
| 13 | release-readiness-validator | Ship gate |
| 14 | prompt-pattern-analyzer | Prompt audit |
| 15 | prompt-engineer | Prompt audit |
| 16 | prompt-quality-validator | Prompt audit |
| 17 | aristotle-explorer | Aristotle lens |
| 18 | aristotle-analyst | Aristotle lens |
| 19 | aristotle-validator | Aristotle lens |
| 20 | aristotle-forecaster | Aristotle lens |
| 21 | workflow-synthesis | Pipeline helper |
| 22 | assumption-excavator | Standalone |

### Commands Included (~22 commands + 5 workflows/pipelines)

Each agent has a corresponding command in `commands/agents/`. Plus the 5 workflow/pipeline commands (pre-implementation, post-implementation, ship, prompt-audit, aristotle-pipeline).

### What's NOT Included (paid tier)

~55 additional agents, ~64 additional commands, ~12 additional workflows/pipelines — including all other cognitive lenses (Hume, Popper, Confucius, Socrates, Archimedes), chaos-validator, data-science agents, advanced forecasters, career document agents, etc.

## What Gets Installed

| Artifact | Count | Source | Destination |
|----------|-------|--------|-------------|
| MCP servers | 2 | npx config (no install) | `~/.claude.json` or `./.mcp.json` |
| Agent definitions | 22 | Bundled `.md` files | `~/.claude/agents/` |
| Command definitions | ~22 | Bundled `.md` files | `~/.claude/commands/agents/` |
| Workflow definitions | 4 | Bundled `.md` files | `~/.claude/commands/workflows/` |
| Pipeline definitions | 1 | Bundled `.md` files | `~/.claude/commands/pipelines/` |
| API key | 1 | User input | Shell profile + MCP env |

## Package Location

New package at `packages/setup/` in the uluops monorepo (alongside `ops-sdk`, `registry-sdk`, `cli`).

## UX Flow

Default flow — one prompt (the API key), everything else is smart defaults:

```
$ npx @uluops/setup

  UluOps Setup v0.1.0

  ? Enter your UluOps API key: ulr_abc123...
    ✓ Key validated (alex@uluops.ai)

  ✓ MCP config → ~/.claude.json (2 servers)
  ✓ 22 agents → ~/.claude/agents/
  ✓ 27 commands → ~/.claude/commands/
  ✓ Health check passed — both APIs reachable

  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Setup complete! 73 MCP tools · 22 agents · 27 slash commands

  ⚠ Restart Claude Code to load agents, then try:

    /workflows:post-implementation .

  WORKFLOWS
    /workflows:pre-implementation    Design review before coding
    /workflows:post-implementation   Iterative validation loop
    /workflows:ship                  Final gate before shipping
    /workflows:prompt-audit          Audit agent prompts

  PIPELINES
    /pipelines:aristotle             Four-cause teleological analysis

  AGENTS (run individually)                          MODEL
    /agents:validate                 Code quality     sonnet
    /agents:type-safety              TypeScript       sonnet
    /agents:test-review              Test quality     sonnet
    /agents:optimize                 Performance      sonnet
    /agents:frontend                 React/a11y       sonnet
    /agents:mcp-validate             MCP compliance   sonnet
    /agents:architect                Design review    sonnet
    /agents:audit                    Runtime bugs     opus
    /agents:security                 OWASP            sonnet
    /agents:api-contract             API alignment    sonnet
    /agents:release                  Publish ready    sonnet
    /agents:public-interface         README/exports   sonnet
    /agents:docs-validate            Documentation    sonnet
    /agents:prompt-validate          Prompt review    sonnet
    /agents:prompt-quality           Prompt quality   sonnet
    /agents:pattern-analyzer         Patterns         sonnet
    /agents:aristotle-explorer       Categories       opus
    /agents:aristotle-analyst        Four causes      opus
    /agents:aristotle-validator      Teleology        opus
    /agents:aristotle-forecaster     Potentiality     opus
    /agents:assumption-excavator     Assumptions      sonnet
    /agents:workflow-synthesis       Synthesis        sonnet

  For SDK/CLI usage, add to your shell profile:
    export ULUOPS_API_KEY="ulr_abc123..."

  Run again to update: npx @uluops/setup
```

Power users can override defaults with flags — no prompts shown for these:
- `--scope local` → writes `./.mcp.json` instead of `~/.claude.json`
- `--local-defs` → saves agents/commands to `./uluops/` for review
- `--shell` → auto-writes export to shell profile

## Architecture

```
packages/setup/
  package.json
  src/
    cli.ts              — Entry point, arg parsing (commander)
    steps/
      detect.ts         — OS, shell, Node version, existing config
      auth.ts           — API key resolution + validation
      mcp.ts            — Write MCP config (npx-based, no global install needed)
      agents.ts         — Copy agent .md files, track in manifest
      commands.ts       — Copy command .md files with subdirs
      shell.ts          — Add export to shell profile (fenced block)
      verify.ts         — Post-install health check + standalone --verify mode
    lib/
      config-merger.ts  — Deep merge for .mcp.json (preserve non-UluOps entries)
      manifest.ts       — Track installed files in ~/.claude/uluops-manifest.json
      paths.ts          — Cross-platform path resolution
  assets/               — Pre-rendered .md files (built at publish time)
    agents/
    commands/
      agents/
      workflows/
      pipelines/
```

## Key Design Decisions

### 1. Assets committed in repo (no external dependencies)

Pre-rendered `.md` files are committed directly in `packages/setup/assets/`. No build-time rendering, no API calls, no dependency on `uluops-agent-workflows` repo. This means:
- Fully self-contained — no external repos needed to build or publish
- Works offline at install time (except key validation)
- Instant file copy, no rendering step
- Updates via copying new `.md` files into `assets/` and bumping the version

### 2. MCP config scope — global by default, no prompt

Defaults to global (`~/.claude.json`) with no prompt. Power users override with `--scope local`.

| Scope | Config File | Effect | How to select |
|-------|-------------|--------|---------------|
| **Global** (default) | `~/.claude.json` → `mcpServers` key | MCP tools available in all projects | Default — no flag needed |
| **Local** | `./.mcp.json` in current working directory | MCP tools scoped to this project only | `--scope local` |

**Global mode** (`~/.claude.json`):
- Deep merges only `mcpServers.uluops-tracker` and `mcpServers.uluops-registry` keys
- Preserves all other top-level keys (`numStartups`, `hooks`, `tipsHistory`, etc.) and non-UluOps MCP servers

**Local mode** (`./.mcp.json`):
- Creates or merges into project-level `.mcp.json`
- Only contains `mcpServers` (no other Claude Code config)
- Auto-adds `.mcp.json` to `.gitignore` if git repo detected

Target MCP config (same shape for both files). Uses `npx -y` instead of hardcoded paths to avoid global install permission issues and nvm path breakage:
```json
{
  "mcpServers": {
    "uluops-tracker": {
      "command": "npx",
      "args": ["-y", "uluops-tracker-mcp-client"],
      "env": {
        "ULUOPS_TRACKER_API_URL": "https://api.uluops.ai/api/v1",
        "ULUOPS_TRACKER_API_KEY": "ulr_..."
      }
    },
    "uluops-registry": {
      "command": "npx",
      "args": ["-y", "uluops-registry-mcp-client"],
      "env": {
        "ULUOPS_REGISTRY_URL": "https://api.uluops.ai/api/v1/registry",
        "ULUOPS_API_KEY": "ulr_..."
      }
    }
  }
}
```

> **Why `npx -y`?** Eliminates two friction points: (1) no `sudo` needed for global install, (2) path doesn't break when users switch Node versions via nvm/fnm. The `-y` flag auto-confirms the package install. After first run, npx caches the package so startup is fast.

### 3. Agent/command destination — global by default, no prompt

Defaults to `~/.claude/` (the standard Claude Code location) with no prompt. Power users override with `--local-defs`.

| Destination | Path | Effect | How to select |
|-------------|------|--------|---------------|
| **Global** (default) | `~/.claude/agents/` + `~/.claude/commands/` | Agents load automatically in Claude Code | Default — no flag needed |
| **Local** | `./uluops/agents/` + `./uluops/commands/` | Saved for review/customization only | `--local-defs` |

> **Note:** Claude Code only loads agents from `~/.claude/agents/`. Local definitions are for review — the user would copy desired agents to `~/.claude/agents/` to activate. The `--local-defs` output explains this.

### 4. Manifest for idempotent updates

`~/.claude/uluops-manifest.json` tracks which files were installed by us:
```json
{
  "version": "0.1.0",
  "installedAt": "2026-03-08T...",
  "mcpScope": "global",
  "mcpConfigPath": "/home/user/.claude.json",
  "defsScope": "global",
  "defsPath": "/home/user/.claude",
  "shellModified": false,
  "agents": ["code-auditor-agent.md", ...],
  "commands": ["agents/api-contract.md", "workflows/ship.md", ...]
}
```

On re-run: overwrite managed files, skip unchanged (hash compare), remove files no longer in package (definition deleted upstream). Never delete files not in the manifest (user's custom agents).

**Directory creation:** If `~/.claude/`, `~/.claude/agents/`, or `~/.claude/commands/` don't exist (Claude Code never run), the installer creates them with `mkdir -p`. Same for command subdirectories (`commands/agents/`, `commands/workflows/`, `commands/pipelines/`).

### 5. API key resolution order

1. `--api-key <key>` flag (CI/automation)
2. `ULUOPS_API_KEY` env var (already set)
3. `~/.uluops/credentials.json` (existing CLI auth)
4. Interactive prompt (fallback)

Validate with GET to `https://api.uluops.ai/api/v1/registry/users/me`.

**Key validation errors** — clear, actionable messages (URL only shown on failure):
- Missing `ulr_` prefix → "API keys start with ulr_ — get one at app.uluops.ai/settings/api-keys"
- 401 response → "Invalid API key — generate a new one at app.uluops.ai/settings/api-keys"
- Network error → "Can't reach api.uluops.ai — check your connection. Use --skip-validation to continue offline."
- Empty input → "Get a key at app.uluops.ai/settings/api-keys" and re-prompt

### 6. Shell profile — print-only by default, de-emphasized

The API key is already embedded in the MCP config `env` block, so Claude Code MCP tools work without any shell export. The shell export is only needed for direct SDK or CLI usage.

By default, the installer prints the export line at the bottom of the output (after the command list), not as a prominent step:

```
  For SDK/CLI usage, add to your shell profile:
    export ULUOPS_API_KEY="ulr_..."
```

If the user passes `--shell`, the installer writes a fenced block to the detected profile:

```bash
# --- UluOps (managed by @uluops/setup) ---
export ULUOPS_API_KEY="ulr_..."
# --- /UluOps ---
```

On re-run with `--shell`, replaces content between fence markers. Detects shell: bash → `~/.bashrc` (Linux) / `~/.bash_profile` (macOS), zsh → `~/.zshrc`, fish → `~/.config/fish/config.fish`.

## CLI Flags

```
npx @uluops/setup [options]

  --api-key <key>    API key (skip prompt)
  --scope <mode>     MCP config scope: "global" (~/.claude.json) or "local" (./.mcp.json)
  --local-defs       Save agents/commands locally (./uluops/) instead of ~/.claude/
  --shell            Write API key export to shell profile (default: print only)
  --skip-validation  Accept API key without verifying against server
  --verify           Check existing installation health (no changes)
  --uninstall        Remove all UluOps artifacts
  --dry-run          Show what would happen
  -y, --yes          Skip confirmations
```

### `--uninstall`

1. Delete manifest-tracked files from `~/.claude/agents/` and `~/.claude/commands/` (or local path if `--local-defs` was used)
2. Remove `uluops-tracker` + `uluops-registry` from config file (reads scope from manifest to know which file)
3. Remove fenced block from shell profile (if `--shell` was used)
4. Delete manifest

### 7. Post-setup health check

After all files are written, the installer verifies the setup actually works:

1. **API connectivity** — GET to both tracker and registry API health endpoints using the provided key
2. **File integrity** — Count agent and command files at the destination, compare against manifest
3. **MCP config validity** — Parse the written config file, verify JSON is valid and entries are present

If any check fails, show a clear error with remediation steps (e.g., "API key rejected — regenerate at app.uluops.ai/settings").

### 8. `--verify` for troubleshooting

Standalone mode that checks an existing installation without modifying anything. Reads the API key from the MCP config file recorded in the manifest (falls back to `ULUOPS_API_KEY` env var):

```
$ npx @uluops/setup --verify

  UluOps Installation Check

  ✓ Manifest found (v0.1.0, installed 2026-03-08)
  ✓ API key valid (user: alex@uluops.ai)
  ✓ Tracker API reachable
  ✓ Registry API reachable
  ✓ MCP config present in ~/.claude.json (2 servers)
  ✓ 22/22 agents in ~/.claude/agents/
  ✓ 27/27 commands in ~/.claude/commands/
  ⚠ Update available: v0.2.0 (run npx @uluops/setup@latest)

  All checks passed.
```

### 9. Update awareness

On re-run, compare the installed manifest version against the current package version:

- **Same version** — Skip file copy, show "Already up to date"
- **New version** — Show diff: "3 agents updated, 1 new agent added, 0 removed"
- **Stale install detected** — If manifest version is 2+ minor versions behind, suggest update

### 10. Conflict detection on first install

If no manifest exists but `~/.claude/agents/` already contains files matching our agent names:

```
  ⚠ Found 5 existing agents that match UluOps definitions:
    code-validator-agent.md (modified 2026-03-01)
    test-architect-agent.md (modified 2026-03-01)
    ...

  These will be overwritten. Continue? (Y/n)
```

Protects users who manually installed agents earlier. With `-y` flag, overwrites without prompting.

## Platform Support

| Platform | Status | Notes |
|----------|--------|-------|
| **Linux** | Supported | Primary target |
| **macOS** | Supported | `~/.bash_profile` instead of `~/.bashrc` for shell detection |
| **WSL2** | Supported | Detected via `/proc/version`, treated as Linux |
| **Windows (native)** | Not supported (v0.1.0) | Path resolution (`~` expansion), shell profile (PowerShell `$PROFILE`), and `npx` behavior differ. Future enhancement. |

## Future Enhancements

### Trial key (no-signup onboarding)

Allow users to press Enter at the API key prompt to get a temporary trial key — no account required. Eliminates the 5-step signup wall before first value.

```
  ? Enter your UluOps API key (or press Enter for a free trial):
    ✓ Trial mode activated (limited to 10 runs/day, expires in 14 days)
```

**Trial key characteristics:**
- Rate-limited (e.g., 10 validation runs/day)
- Expires after 7-14 days
- No persistent dashboard (or anonymous project that auto-deletes)
- Full agent access — user experiences the real product
- Key prefix: `ulr_trial_*` to distinguish from real keys

**Backend requirements:**
- Unauthenticated endpoint: `POST /api/v1/auth/trial` → returns `{ apiKey: "ulr_trial_..." }`
- Anonymous account with restricted quotas
- Expiry cleanup job
- Abuse mitigation (IP-based rate limiting on trial creation)

**Installer change:** On empty Enter at key prompt, call the trial endpoint. Everything else works the same — the trial key goes into MCP config and the manifest tracks `"trial": true` for upgrade prompts later.

**Upgrade path:** `npx @uluops/setup --api-key ulr_real_key` replaces the trial key everywhere (MCP config, manifest). Output: "Upgraded from trial → full account (alex@uluops.ai)."

**Priority:** v0.2.0+ — requires API-side work. Installer should be designed to support it (detect empty Enter, call endpoint) but the backend endpoint doesn't exist yet.

## Prerequisites (before publishing @uluops/setup)

These packages must be published to npm first:

| Package | Current State | Publish To |
|---------|--------------|------------|
| `uluops-tracker-mcp-client` | Local dev only (`/home/alexs/uluops/ops-uluops-mcp/`) | `npm publish` → npmjs.com |
| `uluops-registry-mcp-client` | Local dev only (`/home/alexs/uluops/registry-uluops-mcp/`) | `npm publish` → npmjs.com |

Both need:
- Production API URLs as defaults (`https://api.uluops.ai/api/v1` and `https://api.uluops.ai/api/v1/registry`)
- `package.json` `name` fields confirmed (must match what the installer puts in `npx -y <name>`)
- `dist/` included in `files` array for npm publish
- README with basic usage

## Assets (committed, self-contained)

The 22 rendered agent `.md` files and ~27 command/workflow/pipeline `.md` files are committed directly into `packages/setup/assets/`. No external repo dependency — the package is fully self-contained.

```
assets/
  agents/                  — 22 rendered agent .md files
    code-validator-agent.md
    test-architect-agent.md
    ...
  commands/
    agents/                — 22 command .md files
    workflows/             — 4 workflow .md files
    pipelines/             — 1 pipeline .md file
  manifest.json            — file checksums for update detection
```

**Updating assets:** When agent definitions change upstream in `uluops-agent-workflows`, copy the updated rendered `.md` files into `assets/` and bump the package version. This can be done manually or via a refresh script that copies from a local checkout.

## Build Pipeline

```json
{
  "scripts": {
    "build": "tsc",
    "prepublishOnly": "npm run build"
  }
}
```

No render step needed — assets are pre-committed. Build only compiles TypeScript.

## Package Spec

```json
{
  "name": "@uluops/setup",
  "version": "0.1.0",
  "description": "Zero-friction installer for UluOps + Claude Code",
  "type": "module",
  "bin": {
    "uluops-setup": "./dist/cli.js"
  },
  "files": ["dist", "assets"],
  "engines": {
    "node": ">=18.0.0"
  },
  "dependencies": {
    "@inquirer/prompts": "^7.0.0",
    "chalk": "^5.0.0",
    "ora": "^8.0.0",
    "commander": "^12.0.0"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "tsx": "^4.0.0",
    "vitest": "^3.0.0"
  }
}
```

> The `bin` field is what makes `npx @uluops/setup` work. The `files` array ensures both compiled code and pre-committed assets are included in the npm tarball.

## Reference Files

| File | Why |
|------|-----|
| `/home/alexs/uluops/registry-uluops-mcp/setup.sh` | Existing manual setup pattern to absorb |
| `/home/alexs/uluops/deprecated/.mcp.json` | MCP config shape reference (env var names, paths) |
| `/home/alexs/.claude/settings.json` | Global Claude Code settings structure |
| `/home/alexs/.claude/agents/*.md` | Target format for rendered agents |
| `/home/alexs/uluops/uluops-agent-workflows/udl/` | Source YAML definitions |

## Verification

1. `npm run build` passes in `packages/setup/`
2. `npx @uluops/setup --dry-run --api-key ulr_test` shows all steps without modifying anything
3. Full run: creates `~/.claude.json` with correct MCP entries, copies agents + commands, prints shell export
4. Re-run: reports "X unchanged, Y updated" — no duplicate files
5. `--uninstall`: removes only managed files, preserves custom agents
6. `--verify`: checks all files, config, and API connectivity without modifying anything
7. New Claude Code session loads all agents and MCP tools
