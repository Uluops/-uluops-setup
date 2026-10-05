---
name: release
description: Final release gate for packages and CLI tools. Validates version consistency, CLI --version, package.json, and docs. Detects semantic-release CI/CD vs manual publishing.
---

# Release Readiness v1
Final release gate for packages and CLI tools. Validates version consistency, CLI --version, package.json, and docs. Detects semantic-release CI/CD vs manual publishing.

## What's New in v1

| Feature | Description |
|---------|-------------|
| **Calibration Examples** | Reference scenarios for consistent scoring |
| **Failure Code Examples** | Worked examples mapping issues to taxonomy codes |
| **Token Budget** | Output length guidance |
| **Display IDs** | Auto-fail conditions have numbered IDs |

## Arguments

**Usage:** `/agents:release <directory>`

**Examples:**
- `/agents:release ./packages/sdk`
- `/agents:release .`
- `/agents:release ./lib`

**Target Directory:** $ARGUMENTS


---

## Pre-Flight

```bash
echo "Running release readiness check on $ARGUMENTS..."
echo "================================================"
```

Verify the target directory exists:

```bash
test -d "$ARGUMENTS" && echo "✓ Directory exists: $ARGUMENTS" || echo "ERROR: Directory '$ARGUMENTS' not found"
```

Enter and confirm location:

```bash
cd "$ARGUMENTS" && pwd
```

Check path exists:

```bash
[ -e "$ARGUMENTS" ] && echo "✓ $ARGUMENTS exists" || echo "Target directory does not exist"
```


---

## Agent Invocation

Run the Release Readiness agent on the validated target directory:

**Agent:** release-readiness-agent.md
**Model:** Sonnet
**Target:** $ARGUMENTS
**Run token:** if this command is running as a phase of a workflow or pipeline that is still executing in this same turn and has minted a run token, reuse that token. A token from an earlier, finished run in this conversation is never reused. Otherwise mint one now: generate the nonce with Bash — `openssl rand -hex 3` — and append it: `release-<nonce>`. Never type the nonce yourself or reuse one you have seen. Check the token matches `^[a-z0-9][a-z0-9-]{2,63}$` before launching; a token that does not match is silently ignored and every row is lost. Remember the token, and the agentId the Agent tool result reports, for the tracker step.
**Prompt tag line:** Begin the agent prompt with `[agent:release-readiness] [run:<token>]`, in that order. The agent-metrics hook reads both from the agent's first message: the name only from `[agent:]` (omitting it captures the metrics nameless), and the run token only from `[run:]` (omitting it drops the agent from the tracker collection).


---

## Auto-Fail Conditions

Critical issues that trigger immediate FAIL regardless of score:

| ID | Condition |
|----|-----------|
| **AF-001** | CLI --version does not match package.json version |
| **AF-002** | Missing CHANGELOG entry for current version |
| **AF-003** | Secrets or API keys in codebase |
| **AF-004** | README.md is missing |
| **AF-005** | Build artifacts stale or missing |
| **AF-006** | console.log in production paths (for libraries) |

---

## Decision Thresholds

| Score | Decision | Meaning |
|-------|----------|---------|
| **>=80** | ✅ PASS | Validation passed, proceed to next phase |
| **<80** | ❌ FAIL | Validation failed, fix issues before proceeding |

**Note:** Any critical issue triggers FAIL regardless of score.

---

## Post-Flight Actions

### On Success

Release readiness check passed with score >= 80

```bash
exit 0
```

### On Failure

Release readiness check failed. Review issues above.

```bash
exit 1
```


---


## PERSIST TO TRACKER (Required)

> **IMPORTANT:** Save to tracker IMMEDIATELY after agent completes, BEFORE presenting the summary to the user. The workflow is not complete until results are persisted.
**1. Get token metrics from buffer** (`<token>` is the run token from Agent Invocation):
```bash
agent-metrics buffer list --run <token> --agent-name release-readiness -f tracker
```

**2. Save to tracker (DO THIS FIRST):**

mcp__uluops-tracker__save_run

**3. Verify saved:** Compare `json.summary.total_issues` with saved count.

**4. THEN present summary to user.**

### Field Mappings

**Definition identity (REQUIRED for execution tracking):**
| Tracker Field | Value | Notes |
|---------------|-------|-------|
| `definition_type` | `command` | From CDL interface |
| `definition_name` | `release` | From CDL interface |
| `definition_version` | `1.0.3` | From CDL interface — this command's version, never an agent's |

**From JSON OUTPUT to Tracker:**
| Source | Tracker Field | Notes |
|--------|---------------|-------|
| `json.result.score` | `agents[].score` | Total score |
| `json.result.decision` | `agents[].decision` | PASS/FAIL |
| `buffer.model` | `validators[].model` | From agent-metrics buffer |
| `buffer.tokens.input_tokens` | `input_tokens` | Raw input tokens |
| `buffer.tokens.output_tokens` | `output_tokens` | Output tokens |
| `buffer.tokens.cache_creation_tokens` | `cache_creation_tokens` | Cache creation |
| `buffer.tokens.cache_read_tokens` | `cache_read_tokens` | Cache reads |
| `buffer.tokens.cached_input_tokens` | `cached_input_tokens` | Cached input (subtracted in total_effective) |
| `buffer.tokens.reasoning_output_tokens` | `reasoning_output_tokens` | Reasoning — subset of gross output, not added |
| `buffer.tokens.thinking_tokens` | `thinking_tokens` | Thinking — subset of gross output, not added |
| `buffer.tokens.tool_tokens` | `tool_tokens` | Tool — subset of gross output, not added |
| `buffer.tokens.total_effective_tokens` | `total_effective_tokens` | Effective total |
| `buffer.harness` | `harness` | Producing CLI/runtime (claude-code, codex, …) |
| `buffer.duration_ms` | `duration_ms` | Execution duration |
| `buffer.agent_id` | `agent_id` | Provenance join key to buffer entry + transcript |
| `buffer.definition_version` | `agents[].definition_version` | The agent's own definition version, captured at spawn; absent when agent-metrics could not name it |
| `json.categories[].findings[].issues[]` | `recommendations[]` | Flatten nested structure |
| `json.analysis.records[]` | `analysis_records[]` | Structured analysis records (v1.4.0) |
| `json.analysis.system_metrics` | `analysis_summary.system_metrics` | Agent-type-specific metrics |
| `json.analysis.category_scores[]` | `analysis_summary.category_scores[]` | Category score breakdown |
| `json.analysis.epistemic_assessment` | `analysis_summary.epistemic_assessment` | Failure signature risk ratings |
| `json.analysis.audit_implications[]` | `analysis_summary.audit_implications[]` | Trajectory projections |

**Note:** `json` = agent's JSON OUTPUT, `buffer` = `agent-metrics buffer list --run <token> --agent-name release-readiness -f tracker` — rows are selected by run token, never by time, so it returns this run's rows however late you collect. From what it returns, keep only rows whose `agent_id` matches an agentId reported by an Agent tool result from this invocation, and drop the rest — a reused or colliding token can return another run's rows, and a row you did not launch is never yours. If no row matches your agentId — even when the row count looks right — a `[run:]` or `[agent:]` tag was dropped or mistyped: recover the row with `agent-metrics extract <agentId> -f tracker --agent-name release-readiness`, using the agentId from this invocation's Agent tool result. Only if that result reported no agentId, apply the no-buffer-entry rule below and state the shortfall in your summary. Never widen the query (drop `--run`, add `--since`, list the whole buffer) to find a missing row — it returns other runs' rows. Splice each buffer entry verbatim into `agents[]` — every field carries through as-is and unfiltered, including `duration_ms`, `agent_id` and `definition_version`. Never copy the command's `definition_version` onto an agent. If agent-metrics omitted the agent's `definition_version`, omit it — never type one or read it from the agent file. If the agent has no buffer entry, keep its score and decision with no tokens, `agent_id` or `definition_version`; never invent an `agent_id`.
**Note:** `analysis_records` and `analysis_summary` are optional (v1.4.0). Omit if agent output has no `analysis` section.

---

## Source

**Schema:** https://uluops.ai/schemas/cdl/v2.0.0/command.json
**Definition:** https://api.uluops.ai/api/v1/registry/definitions/command/release@1.0.3
**Runtime:** https://api.uluops.ai/api/v1/registry/definitions/command/release@1.0.3/render
**Agent:** https://api.uluops.ai/api/v1/registry/definitions/agent/release-readiness (declared: latest)


---
*Generated from CDL v2.0.0 | Command: release v1.0.3*
