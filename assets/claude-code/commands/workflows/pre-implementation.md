---
name: pre-implementation
description: Validates proposed design and architecture BEFORE implementation begins. Architect review gates; docs, assumption, fragility, adoption-drift, Machiavelli and Dieter Rams reads are advisory, plus a security analysis and a circumvention forecast or trust-boundary map when the target touches security. Blocks implementation only on the architect.
tools: Read, Grep, Glob, Bash
model: opus
---

# Pre-Implementation

> Validates proposed design and architecture BEFORE implementation begins. Architect review gates; docs, assumption, fragility, adoption-drift, Machiavelli and Dieter Rams reads are advisory, plus a security analysis and a circumvention forecast or trust-boundary map when the target touches security. Blocks implementation only on the architect.

Duration: 3-10 minutes
**Arguments**: `target` (required)
## Pre-Flight Detection

- **design_docs_detected**: `test -n "$(find . \( -name '*design*' -o -name '*spec*' -o -name '*prd*' -o -name '*plan*' -o -name 'README.md' \) ! -path '*/node_modules/*' ! -path '*/dist/*' ! -path '*/.venv/*' -print -quit 2>/dev/null)"`
- **security_surface_detected**: `grep -rqiE --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist "(authenticat|authori[sz]|authn|authz|oauth|jwt|token|credential|secret|password|api[ _-]?key|session|permission|rbac|tenant|encrypt|pii|csrf|cors|sso|mfa)" "{{ target_path }}" 2>/dev/null`
- **enforcement_surface_detected**: `grep -rqiE --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist "(allowlist|denylist|blocklist|rate[ -]?limit|throttl|quota|access[ -]control|permission check|enforce|guard)" "{{ target_path }}" 2>/dev/null`
## Execution

Ask user: **Sequential** (stop on first failure) or **Parallel** (run groups concurrently)?
```
Group 1 (parallel): architect + docs-validator
Group 2 (parallel): assumption-review + fragility + adoption-drift + effectual-truth + essentialism + security-analysis + security-circumvention + security-trust-boundaries
Group 3 (always): persist
```
## Phases

**Run token:** before the first phase, mint one run token for the whole workflow — generate the nonce with Bash — `openssl rand -hex 3` — and append it: `pre-implementation-<nonce>`. Never type the nonce yourself or reuse one you have seen. Check the token matches `^[a-z0-9][a-z0-9-]{2,63}$` before launching; a token that does not match is silently ignored and every row is lost. If this workflow is running as a stage of a pipeline that is still executing in this same turn, reuse the pipeline's token instead; a token from an earlier, finished run in this conversation is never reused. Record the agentId each Agent tool result reports, paired with the agent name from the same call. Every agent launched in this workflow, directly or by a slash command, carries this one token.

**Agent launch protocol:** When a phase runs an agent directly via the Agent tool, begin the prompt with `[agent:<agent-name>] [run:<token>]` (lowercase kebab-case, in that order). The agent-metrics hook reads the name only from `[agent:]` and the run token only from `[run:]`: omitting `[agent:]` captures the agent nameless, and omitting `[run:]` drops it from the tracker collection. Phases that invoke slash commands get both from the command's own definition, which reuses this workflow's token instead of minting its own.

| # | Agent | Threshold | Gate | Condition |
|---|-------|-----------|------|-----------|
| 1 |  | threshold >= 80, on fail: stop | stop | — |
| 2 |  | threshold >= 75, on fail: warn | stop | context.has_design_docs |
| 3 |  | threshold >= 70, on fail: warn | stop | — |
| 4 |  | threshold >= 70, on fail: warn | stop | — |
| 5 |  | threshold >= 70, on fail: warn | stop | — |
| 6 |  | threshold >= 75, on fail: warn | stop | — |
| 7 |  | threshold >= 70, on fail: warn | stop | — |
| 8 |  | threshold >= 85, on fail: warn | stop | context.security_enabled |
| 9 |  | threshold >= 60, on fail: warn | stop | context.circumvention_enabled |
| 10 |  | threshold >= 85, on fail: warn | stop | context.trust_boundary_enabled |
| 11 | workflow-synthesis@latest | threshold >= 0, on fail: warn | stop | — |

**Architecture Review**: Architectural fit with existing codebase; Design quality and complexity; Scope bounds (LOC, files, dependencies); Completeness of error handling and data flow
**Documentation Validation**: Design doc completeness; API contract clarity; Data flow documentation
**Epistemic Assumption Review** (after architect): Implicit assumptions in proposed design; Overclaiming of capabilities or guarantees; Reasoning quality behind architectural decisions
**Fragility Read** (after architect): PRE-IMPLEMENTATION design, not built code: hardening explicitly deferred to implementation is legitimate; Unearned confidence in the spec's own claims (scope estimates, "no hazard", "one-line fix", current-state descriptions); Verify cited file:line claims; mark what cannot yet be substantiated [VERIFY]
**Adoption Drift Read** (after architect): PRE-IMPLEMENTATION design: how builders, operators and consumers will actually adopt what it specifies; Misread defaults, skipped steps, copy-paste paths, folk interpretations - each grounded in the spec's text
**Effectual Truth Read** (after architect): PRE-IMPLEMENTATION design: stated commitments (guarantees, invariants, always/never, ownership) against the mechanism it specifies; Can the specified mechanism enact each commitment? Unverifiable claims about the existing system are [VERIFY], not IDEALIZED
**Essentialism Read** (after architect): PRE-IMPLEMENTATION design: configuration surface, options, layers, phases and endpoints its use cases do not need; Every recommended removal preserves each documented use case
**Design Security Analysis** (after architect): PRE-IMPLEMENTATION design, not code: the threat model it implies (authn/authz, secrets, input trust, data exposure, tenant isolation); A control the spec assigns to implementation is legitimate; fault controls it never names
**Circumvention Forecast** (after architect): PRE-IMPLEMENTATION design: adversary paths against the enforcement surfaces it adds or changes; Direct subversion, boundary evasion, capability hijacking - cite the spec text each path exploits
**Trust Boundary Map** (after architect): PRE-IMPLEMENTATION design: every point where it confers, delegates or assumes trust; Classify each handoff explicit / implicit / violated; mark what implementation must still decide [VERIFY]
**Persist Results**: Synthesize findings and persist to tracker
## Scoring

**Method**: weighted_average
 — architect: 55%, assumption-review: 20%, docs-validator: 25%
## Results Submission

Write markdown report to: `{{ target_path }}/{{ report_file }}`
Save ALL findings to tracker via `mcp_uluops-tracker_save_run` with project=`{{ target_name }}`, workflow_type=`pre-implementation`, definition_type=`workflow`, definition_name=`pre-implementation`, definition_version=`2.2.0`. Include agents array (name, score, decision) with every field of each `agent-metrics buffer list --run <token> -f tracker` entry spliced verbatim and unfiltered (rows selected by this workflow's run token, never by time; from what it returns, keep only rows whose `agent_id` matches an agentId reported by an Agent tool result from this invocation, and drop the rest — a reused or colliding token can return another run's rows, and a row you did not launch is never yours) — including definition_version, the version of that agent's own definition captured at spawn — and recommendations array (agent, title, priority, severity, description, file_path, line_number). Each file:line reference becomes a separate recommendation. Priority: blocking=critical, warnings=suggested, post-ship=backlog. The definition_version above is this workflow's; never copy it onto an agent. Per entry: if agent-metrics omitted an entry's definition_version, omit it on that entry — never type one, read it from the agent file, or move one between entries (same-name entries included). An agent with no agent-metrics row keeps its score and decision with no tokens, agent_id or definition_version. Never invent, copy or reuse an agent_id, and never drop or rename entries to clear a tracker warning. If a launched agentId has no matching row, a `[run:]` tag was dropped: recover it with `agent-metrics extract <agentId> -f tracker --agent-name <name>`, pairing the agentId with the name from the same Agent tool call — never an id whose launch you did not see. Apply the no-row rule only for an agent whose Agent tool result reported no agentId, and note the shortfall. Never widen the query (drop `--run`, add `--since`, list the whole buffer) to find a missing row.
After saving, query tracker and compare counts. Mismatches from cross-phase deduplication are expected — warn only, do not re-attempt.

## Source

**Schema:** https://uluops.ai/schemas/wdl/v3.1.0/workflow.json
**Definition:** https://api.uluops.ai/api/v1/registry/definitions/workflow/pre-implementation@2.2.0
**Runtime:** https://api.uluops.ai/api/v1/registry/definitions/workflow/pre-implementation@2.2.0/render

---
*Generated from WDL v3.1.0 | Workflow: pre-implementation v2.2.0*
