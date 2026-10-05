---
name: workflow-synthesis
description: Synthesizes cross-cutting insights from multiple upstream agent outputs. Identifies convergence, divergence, blind spots, and emergent patterns. Use at the end of any multi-agent workflow for integrated meta-analysis.
---

# Workflow Synthesis v1
Synthesizes cross-cutting insights from multiple upstream agent outputs. Identifies convergence, divergence, blind spots, and emergent patterns. Use at the end of any multi-agent workflow for integrated meta-analysis.

## What's New in v1

| Feature | Description |
|---------|-------------|
| **Calibration Examples** | Reference scenarios for consistent scoring |
| **Failure Code Examples** | Worked examples mapping issues to taxonomy codes |
| **Token Budget** | Output length guidance |
| **Display IDs** | Auto-fail conditions have numbered IDs |

## Arguments

**Usage:** `/agents:workflow-synthesis <directory>`

**Examples:**
- `/agents:workflow-synthesis uluops-registry-api/`
- `/agents:workflow-synthesis ops-uluops-api/`
- `/agents:workflow-synthesis udl/adl/v3/code-validator.agent.yaml`
- `/agents:workflow-synthesis docs/specs/cognitive-lens-library-spec.md`

**Target Directory:** $ARGUMENTS


---

## Pre-Flight

```bash
echo "Synthesizing cross-cutting insights from upstream agent outputs for $ARGUMENTS..."
echo "================================================================================="
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
[ -e "$ARGUMENTS" ] && echo "✓ $ARGUMENTS exists" || echo "Target file or directory does not exist"
```


---

## Agent Invocation

Run the Workflow Synthesis agent on the validated target directory:

**Agent:** workflow-synthesis-agent.md
**Model:** Opus
**Target:** $ARGUMENTS
**Run token:** if this command is running as a phase of a workflow or pipeline that is still executing in this same turn and has minted a run token, reuse that token. A token from an earlier, finished run in this conversation is never reused. Otherwise mint one now: generate the nonce with Bash — `openssl rand -hex 3` — and append it: `workflow-synthesis-<nonce>`. Never type the nonce yourself or reuse one you have seen. Check the token matches `^[a-z0-9][a-z0-9-]{2,63}$` before launching; a token that does not match is silently ignored and every row is lost. Remember the token, and the agentId the Agent tool result reports, for the tracker step.
**Prompt tag line:** Begin the agent prompt with `[agent:workflow-synthesis] [run:<token>]`, in that order. The agent-metrics hook reads both from the agent's first message: the name only from `[agent:]` (omitting it captures the metrics nameless), and the run token only from `[run:]` (omitting it drops the agent from the tracker collection).


---

## Auto-Fail Conditions

Critical issues that trigger immediate FAIL regardless of score:

| ID | Condition |
|----|-----------|
| **AF-001** | Mere summarization — synthesis restates individual findings without cross-referencing |
| **AF-002** | Missing composition test — no assessment of emergent insights |
| **AF-003** | Synthesis claims not traced to specific upstream agents |
| **AF-004** | Convergence analyzed but divergence section empty or perfunctory |
| **AF-005** | Claiming agents agree when findings are about different aspects |

---

## Decision Thresholds

| Score | Decision | Meaning |
|-------|----------|---------|
| **>=75** | ✅ PASS | Validation passed, proceed to next phase |
| **<75** | ❌ FAIL | Validation failed, fix issues before proceeding |

**Note:** Any critical issue triggers FAIL regardless of score.

---

## Post-Flight Actions

### On Success

Synthesis INTEGRATED — cross-cutting insights produced from upstream agent outputs

```bash
exit 0
```

### On Failure

Synthesis FRAGMENTED — upstream findings do not compose into emergent insights for this artifact

```bash
exit 1
```


---


## PERSIST TO TRACKER (Required)

> **IMPORTANT:** Save to tracker IMMEDIATELY after agent completes, BEFORE presenting the summary to the user. The workflow is not complete until results are persisted.
**1. Get token metrics from buffer** (`<token>` is the run token from Agent Invocation):
```bash
agent-metrics buffer list --run <token> --agent-name workflow-synthesis -f tracker
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
| `definition_name` | `workflow-synthesis` | From CDL interface |
| `definition_version` | `1.1.0` | From CDL interface — this command's version, never an agent's |

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

**Note:** `json` = agent's JSON OUTPUT, `buffer` = `agent-metrics buffer list --run <token> --agent-name workflow-synthesis -f tracker` — rows are selected by run token, never by time, so it returns this run's rows however late you collect. From what it returns, keep only rows whose `agent_id` matches an agentId reported by an Agent tool result from this invocation, and drop the rest — a reused or colliding token can return another run's rows, and a row you did not launch is never yours. If no row matches your agentId — even when the row count looks right — a `[run:]` or `[agent:]` tag was dropped or mistyped: recover the row with `agent-metrics extract <agentId> -f tracker --agent-name workflow-synthesis`, using the agentId from this invocation's Agent tool result. Only if that result reported no agentId, apply the no-buffer-entry rule below and state the shortfall in your summary. Never widen the query (drop `--run`, add `--since`, list the whole buffer) to find a missing row — it returns other runs' rows. Splice each buffer entry verbatim into `agents[]` — every field carries through as-is and unfiltered, including `duration_ms`, `agent_id` and `definition_version`. Never copy the command's `definition_version` onto an agent. If agent-metrics omitted the agent's `definition_version`, omit it — never type one or read it from the agent file. If the agent has no buffer entry, keep its score and decision with no tokens, `agent_id` or `definition_version`; never invent an `agent_id`.
**Note:** `analysis_records` and `analysis_summary` are optional (v1.4.0). Omit if agent output has no `analysis` section.

---

## Source

**Schema:** https://uluops.ai/schemas/cdl/v2.0.0/command.json
**Definition:** https://api.uluops.ai/api/v1/registry/definitions/command/workflow-synthesis@1.1.0
**Runtime:** https://api.uluops.ai/api/v1/registry/definitions/command/workflow-synthesis@1.1.0/render
**Agent:** https://api.uluops.ai/api/v1/registry/definitions/agent/workflow-synthesis (declared: latest)


---
*Generated from CDL v2.0.0 | Command: workflow-synthesis v1.1.0*
