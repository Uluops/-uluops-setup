---
name: workflow-synthesis
description: Synthesizes cross-cutting insights from multiple upstream agent outputs. Identifies convergence, divergence, blind spots, and emergent patterns across independent analyses.
model: opus
---

# Workflow Synthesis
Synthesizes cross-cutting insights from multiple upstream agent outputs in any workflow. Identifies convergence, divergence, blind spots, and emergent patterns across independent analyses. Produces meta-insights absent from any individual output.

## Arguments

**Usage:** `/agents:workflow-synthesis <directory>`

**Examples:**
- `/agents:workflow-synthesis .`
- `/agents:workflow-synthesis src/`

**Target Directory:** $ARGUMENTS

---

## Pre-Flight

```bash
echo "Running workflow synthesis on $ARGUMENTS..."
echo "============================================"
```

Verify the target directory exists:

```bash
test -d "$ARGUMENTS" && echo "✓ Directory exists: $ARGUMENTS" || echo "ERROR: Directory '$ARGUMENTS' not found"
```

Enter and confirm location:

```bash
cd "$ARGUMENTS" && pwd
```

---

## Agent Invocation

Run the Workflow Synthesis agent on the validated target directory:

**Agent:** workflow-synthesis-agent.md
**Model:** Opus
**Target:** $ARGUMENTS

The agent synthesizes cross-cutting insights from multiple upstream analyses.

---

## Decision Thresholds

| Score | Decision | Meaning |
|-------|----------|---------|
| **INTEGRATED** | Analyses converge on consistent picture | |
| **FRAGMENTED** | Significant divergence or blind spots found | |

---


## PERSIST TO TRACKER (Required)

> **IMPORTANT:** Save to tracker IMMEDIATELY after agent completes, BEFORE presenting the summary to the user. The workflow is not complete until results are persisted.
**1. Get token metrics from buffer:**
```bash
agent-metrics buffer list --since 5m -f tracker
```

**2. Save to tracker (DO THIS FIRST):**

mcp__uluops-tracker__save_features_list

**3. Verify saved:** Compare `json.summary.total_issues` with saved count.

**4. THEN present summary to user.**

### Field Mappings

**From JSON OUTPUT to Tracker:**
| Source | Tracker Field | Notes |
|--------|---------------|-------|
| `json.result.score` | `validators[].score` | Total score |
| `json.result.decision` | `validators[].status` | INTEGRATED/FRAGMENTED |
| `buffer.model` | `validators[].model` | From agent-metrics buffer |
| `buffer.tokens.input_tokens` | `input_tokens` | Raw input tokens |
| `buffer.tokens.output_tokens` | `output_tokens` | Output tokens |
| `buffer.tokens.cache_creation_tokens` | `cache_creation_tokens` | Cache creation |
| `buffer.tokens.cache_read_tokens` | `cache_read_tokens` | Cache reads |
| `buffer.tokens.total_effective_tokens` | `total_effective_tokens` | Effective total |
| `json.categories[].findings[].issues[]` | `recommendations[]` | Flatten nested structure |

**Note:** `json` = agent's JSON OUTPUT, `buffer` = `agent-metrics buffer list -f tracker`

---

## Source

**Agent:** `agents/workflow-synthesis-agent.md`
