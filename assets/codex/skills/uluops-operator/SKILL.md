---
name: uluops-operator
description: "Use when operating inside UluOps from Codex: using UluOps MCP tools or the ulu CLI; rendering or running registry agents, commands, workflows, or pipelines; saving Codex subagent runs to tracker projects; querying, triaging, or closing tracker issues; inspecting analysis records; or deciding how UluOps definitions should map onto Codex skills, agents, and local assets."
---

# UluOps Operator

Use this skill as the operating map for UluOps in Codex. UluOps has three main surfaces:

- **Registry**: source of truth for agents, commands, workflows, pipelines, versions, dependencies, and harness-specific rendering.
- **Tracker**: source of truth for projects, runs, issues, analysis summaries, analysis records, reliability, and lifecycle.
- **RAH**: statistical and higher-order analysis over registry/tracker state.

Prefer MCP tools for tracker/registry state changes already exposed in the session. Prefer the `ulu` CLI for rendering definitions, execution surfaces not exposed by MCP, and machine-readable scripting.

## Tool Choice

| Task | Prefer | Notes |
|---|---|---|
| Query tracker projects, runs, issues, summaries | `mcp__uluops_tracker` | Use `query_issues`, `search_issues`, `get_project_summary`, run/analysis tools when available. |
| Update tracker issue status or add notes | `mcp__uluops_tracker` | Use structured status updates with concise resolution reasons. |
| Save Codex agent/pipeline output to tracker | `mcp__uluops_tracker` | Shape recommendations/issues/analysis records explicitly; preserve custom record types when supported. |
| Query registry definitions, versions, dependencies | `mcp__uluops_registry` or `ulu` | Use MCP for lightweight lookups; CLI when rendered output or JSON scripting is needed. |
| Render definitions for Codex | `ulu def get ... --rendered --target codex` | Registry remains source of truth; rendered files are working copies. |
| Execute UluOps definitions directly | `ulu exec ...` | Use when the user explicitly wants CLI execution rather than Codex subagents. |
| Analyze cross-run/project patterns | `mcp__rah` | Use for statistical or trend questions when exposed. |

If a localhost registry/tracker CLI command fails inside Codex with a connection or sandbox-like error, retry the same command with sandbox escalation before changing environment variables or config.

## Codex Surface Rules

Codex does not have Claude-style slash commands as the primary reusable surface.

- Use **skills** for stable UluOps workflows that should trigger naturally in Codex.
- Use rendered **agent TOML** as source material for spawning Codex subagents.
- Treat rendered commands, workflows, and pipelines as **orchestration instructions**. For Codex, they may need to become skills or be executed stepwise by Codex rather than copied as slash commands.
- Do not bulk-install every registry definition as a skill. Keep registry as source of truth and render on demand unless a workflow is stable and high-value.

Default Codex global paths:

```text
~/.codex/config.toml
~/.codex/agents/
~/.codex/skills/
```

## Common Commands

Render definitions for Codex:

```bash
ulu def get agent code-validator --rendered --target codex
ulu def get workflow ship --rendered --target codex
ulu def get pipeline foundations --rendered --target codex
```

Render with a model envelope:

```bash
ulu def get agent assumption-excavator --rendered --target codex -m gpt
```

List and inspect definitions:

```bash
ulu def list --type agent --json
ulu def get agent code-validator --json
ulu deps pipeline foundations --json
ulu versions list agent code-validator --json
```

Tracker reads via CLI when MCP does not expose the needed surface:

```bash
ulu projects list --json
ulu issues list uluops-plans --status open --json
ulu runs list uluops-plans --json
ulu analytics burndown --project uluops-plans --days 30 --json
```

## Canonical Loop

When asked to close the loop on an artifact:

1. Identify the tracker project and artifact path.
2. Pull current open issues or run the requested agent/pipeline.
3. Inspect the artifact and nearby code/docs before editing.
4. Patch the artifact or code with narrow, repo-consistent changes.
5. Verify with tests, typecheck, or text audits appropriate to the change.
6. Save the run or analysis to tracker when new agent output was produced.
7. Mark resolved issues completed with a concrete reason naming the artifact or code path changed.
8. Report what changed, what was verified, and any remaining risk.

Do not mark an issue completed merely because it was inspected. Complete it only when the artifact/code now addresses the finding. Use `deferred`, `wontfix`, `false-positive`, or `observation` when that status is more accurate.

## Running Registry Agents As Codex Subagents

When the user asks to use a UluOps agent through Codex:

1. Render or locate the agent definition for Codex.
2. Read only enough of the TOML to understand the role, inputs, expected output, and scoring vocabulary.
3. Spawn a Codex subagent using that definition's instructions and the target artifact.
4. Ask the subagent for structured output: decision, score, findings/recommendations, analysis records, and evidence.
5. Normalize the output before saving to tracker.

For large artifacts, tell the subagent whether it read the full artifact or performed a targeted pass. Preserve that note in the tracker run summary.

## Saving Runs To Tracker

When saving a Codex subagent result:

- Project: use the user-provided tracker project, or infer from local context only when obvious.
- Workflow type: use the registry definition name or agent name.
- Agent name: use the UluOps agent identifier, not the subagent nickname.
- Recommendations/issues: preserve title, severity, category/failure mode, evidence, and actionable remediation.
- Analysis records: preserve custom `record_type` values; do not force them into a closed enum unless the API requires it.
- Summary: include artifact path, decision, score, method, caveats, and counts.

If the save tool rejects a custom analysis shape, simplify only the rejected field and preserve the semantic content in `content`, `metadata`, or the run summary.

## Issue Triage

For top-issue workflows:

1. Query open issues for the project with `priority: "all"` or the requested severity.
2. Sort by tracker order unless the user requests a different ordering.
3. Investigate each issue against the artifact or code.
4. Patch the source of truth, not only the generated tracker text.
5. Bulk update statuses only after the fixes are in place.

Good resolution reasons are short and concrete:

```text
Resolved in plans/example.md by adding skipMissing runtime semantics and validation coverage.
```

## Registry And Definition Hygiene

- Registry definitions are source of truth; rendered Codex assets can drift.
- Use exact versions when reproducibility matters.
- Use dependencies to understand pipelines before running them.
- For Codex, a pipeline may be better represented as a skill recipe than a slash command or a static TOML file.
- Keep stable, high-value Codex workflows as skills. Keep broad, changing catalogs in the registry.

## Naming Discipline

Use canonical project/repo/service names from tracker or registry when available. Do not invent aliases in specs or issue closures. If names disagree across artifacts, fix the source artifact or call out the mismatch explicitly.

Current known canonical examples:

- Tracker project: `uluops-plans`
- Tracker API service/repo in specs: `ops-uluops-api`
- Registry frontend: `ops-uluops-registry`

## Safety

- Be conservative with mutating registry operations such as publish, archive, deprecate, fork, or delete.
- Be conservative with tracker bulk updates; use them when fixes are already made and the status is clear.
- Never overwrite user edits while installing/rendering local Codex assets. Prefer re-rendering on demand and scoped patches.
