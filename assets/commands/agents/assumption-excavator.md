---
name: assumption-excavator
description: Surfaces implicit assumptions buried in any artifact — agent definitions, prompts, specs, plans, workflows, or documents. Produces a ranked assumption inventory with fragility scores.
---

# Assumption Excavator
Surfaces implicit assumptions buried in any artifact — agent definitions, prompts, specs, plans, workflows, or documents. Produces a ranked assumption inventory with fragility scores.

## Arguments

**Usage:** `/agents:assumption-excavator <directory>`

**Examples:**
- `/agents:assumption-excavator udl/adl/v3/code-validator.agent.yaml`
- `/agents:assumption-excavator agents/my-agent.md`
- `/agents:assumption-excavator docs/architecture.md`
- `/agents:assumption-excavator specs/api-spec.md`

**Target Directory:** $ARGUMENTS

---

## Pre-Flight

```bash
echo "Running assumption excavation on $ARGUMENTS..."
echo "=============================================="
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

Run the Assumption Excavator agent on the validated target directory:

**Agent:** assumption-excavator-agent.md
**Model:** Opus
**Target:** $ARGUMENTS

The agent performs validation across multiple categories (100 points total).

---

## Decision Thresholds

| Score | Decision | Meaning |
|-------|----------|---------|
| **>=70** | ✅ PASS | Validation passed, proceed to next phase |
| **<70** | ❌ FAIL | Validation failed, fix issues before proceeding |

**Note:** Any critical issue triggers FAIL regardless of score.

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
| `json.result.decision` | `validators[].status` | PASS/FAIL |
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

**CDL Schema:** `udl/definition-languages/cdl-schema-v1_3_0.json`
**CDL Source:** `/home/alexs/uluops/uluops-agent-workflows/udl/cdl/v1/assumption-excavator.command.yaml`
**Agent:** `agents/assumption-excavator-agent.md`
