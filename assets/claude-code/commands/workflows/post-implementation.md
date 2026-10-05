---
name: post-implementation
description: Iterative validation workflow. Run after each implementation phase until all agents pass. Includes code optimization and optional TypeScript, MCP, and frontend validators. Use --frontend flag for React/Tailwind projects.
tools: Read, Grep, Glob, Bash
model: opus
---

# Post-Implementation

> Iterative validation workflow. Run after each implementation phase until all agents pass. Includes code optimization and optional TypeScript, MCP, and frontend validators. Use --frontend flag for React/Tailwind projects.

Duration: 6-15 minutes
**Arguments**: `target`
## Pre-Flight Detection

- **typescript_detected**: `test -f '{{ target }}/tsconfig.json'`
- **mcp_python_detected**: `grep -rqE --include="*.py" --exclude-dir="node_modules" --exclude-dir="dist" --exclude-dir="__pycache__" --exclude-dir=".venv" "from mcp|import mcp|FastMCP|@mcp\." {{ target }} 2>/dev/null`
- **mcp_typescript_detected**: `grep -rqE --include="*.ts" --include="*.js" --exclude-dir="node_modules" --exclude-dir="dist" "from .@modelcontextprotocol/sdk.|new McpServer|StdioServerTransport" {{ target }} 2>/dev/null`
- **mcp_dependency_detected**: `grep -rqE --include="package.json" --include="pyproject.toml" --include="requirements.txt" --exclude-dir="node_modules" --exclude-dir="dist" "@modelcontextprotocol|\"mcp\":" {{ target }} 2>/dev/null`
- **frontend_detected**: `test -n "$(find {{ target }} \( -name "*.tsx" -o -name "*.jsx" \) ! -path "*/node_modules/*" ! -path "*/dist/*" -print -quit 2>/dev/null)"`
## Execution

Ask user: **Sequential** (stop on first failure) or **Parallel** (run groups concurrently)?
```
Group 1 (gate): validate
Group 2 (parallel): type-safety + mcp-validator + test-architect
Group 3 (sequential): optimizer
Group 4 (parallel): public-interface + frontend
Group 5 (sequential): security
```
## Phases

**Run token:** before the first phase, mint one run token for the whole workflow — generate the nonce with Bash — `openssl rand -hex 3` — and append it: `post-implementation-<nonce>`. Never type the nonce yourself or reuse one you have seen. Check the token matches `^[a-z0-9][a-z0-9-]{2,63}$` before launching; a token that does not match is silently ignored and every row is lost. If this workflow is running as a stage of a pipeline that is still executing in this same turn, reuse the pipeline's token instead; a token from an earlier, finished run in this conversation is never reused. Record the agentId each Agent tool result reports, paired with the agent name from the same call. Every agent launched in this workflow, directly or by a slash command, carries this one token.

**Agent launch protocol:** When a phase runs an agent directly via the Agent tool, begin the prompt with `[agent:<agent-name>] [run:<token>]` (lowercase kebab-case, in that order). The agent-metrics hook reads the name only from `[agent:]` and the run token only from `[run:]`: omitting `[agent:]` captures the agent nameless, and omitting `[run:]` drops it from the tracker collection. Phases that invoke slash commands get both from the command's own definition, which reuses this workflow's token instead of minting its own.

| # | Agent | Threshold | Gate | Condition |
|---|-------|-----------|------|-----------|
| 1 | validate@latest | threshold >= 75, on fail: stop | stop | — |
| 2 | type-safety@latest | threshold >= 80, on fail: stop | stop | context.typescript_detected |
| 3 | mcp-validate@latest | threshold >= 80, warn if < 65, on fail: stop | stop | context.mcp_detected |
| 4 | test-review@latest | threshold >= 70, on fail: warn | stop | — |
| 5 | optimize@latest | threshold >= 75, on fail: warn | stop | — |
| 6 | public-interface@latest | threshold >= 75, on fail: warn | stop | — |
| 7 | frontend@latest | threshold >= 75, on fail: warn | stop | context.frontend_enabled |
| 8 | security@latest | threshold >= 75, on fail: warn | stop | — |

**Code Validation**: Correctness and best practices; Error handling patterns
**TypeScript Validation** (after validate): Explicit any usage and type holes; Public API type quality
**MCP Protocol Validation** (after validate): Tools, resources, and prompts implementation; Transport and security compliance
**Test Architecture Review** (after validate): Test quality, not just coverage; Critical path coverage
**Code Optimization** (after test-architect): Duplication and structure; Hot path performance
**Public Interface Validation** (after optimizer): README accuracy and completeness; Export hygiene
**Frontend Validation** (after optimizer): Accessibility and theme consistency; Component quality and performance
**Security Analysis** (after public-interface): OWASP Top 10 and CWE Top 25 coverage; Input validation and injection prevention
## Scoring

**Method**: weighted_average
 — validate: 20%, type-safety: 15%, mcp-validator: 10%, test-architect: 15%, optimizer: 10%, public-interface: 10%, frontend: 10%, security: 10%
## Results Submission

Write markdown report to: `{{ target_path }}/{{ features_file }}`
Save ALL findings to tracker via `mcp_uluops-tracker_save_run` with project=`{{ target_name }}`, workflow_type=`post-implementation`, definition_type=`workflow`, definition_name=`post-implementation`, definition_version=`3.2.3`. Include agents array (name, score, decision) with every field of each `agent-metrics buffer list --run <token> -f tracker` entry spliced verbatim and unfiltered (rows selected by this workflow's run token, never by time; from what it returns, keep only rows whose `agent_id` matches an agentId reported by an Agent tool result from this invocation, and drop the rest — a reused or colliding token can return another run's rows, and a row you did not launch is never yours) — including definition_version, the version of that agent's own definition captured at spawn — and recommendations array (agent, title, priority, severity, description, file_path, line_number). Each file:line reference becomes a separate recommendation. Priority: blocking=critical, warnings=suggested, post-ship=backlog. The definition_version above is this workflow's; never copy it onto an agent. Per entry: if agent-metrics omitted an entry's definition_version, omit it on that entry — never type one, read it from the agent file, or move one between entries (same-name entries included). An agent with no agent-metrics row keeps its score and decision with no tokens, agent_id or definition_version. Never invent, copy or reuse an agent_id, and never drop or rename entries to clear a tracker warning. If a launched agentId has no matching row, a `[run:]` tag was dropped: recover it with `agent-metrics extract <agentId> -f tracker --agent-name <name>`, pairing the agentId with the name from the same Agent tool call — never an id whose launch you did not see. Apply the no-row rule only for an agent whose Agent tool result reported no agentId, and note the shortfall. Never widen the query (drop `--run`, add `--since`, list the whole buffer) to find a missing row.
After saving, query tracker and compare counts. Mismatches from cross-phase deduplication are expected — warn only, do not re-attempt.

## Source

**Schema:** https://uluops.ai/schemas/wdl/v3.1.0/workflow.json
**Definition:** https://api.uluops.ai/api/v1/registry/definitions/workflow/post-implementation@3.2.3
**Runtime:** https://api.uluops.ai/api/v1/registry/definitions/workflow/post-implementation@3.2.3/render

---
*Generated from WDL v3.1.0 | Workflow: post-implementation v3.2.3*
