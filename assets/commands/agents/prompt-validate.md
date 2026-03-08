---
name: prompt-validate
description: Validates AI agent prompts for quality and consistency before deployment. Run before adding new agents to the project.
---

# Prompt Validator
Validates AI agent prompts for quality and consistency before deployment. Run before adding new agents to the project.

## Arguments

**Usage:** `/agents:prompt-validate <directory>`

**Examples:**
- `/agents:prompt-validate agents/my-agent.md`
- `/agents:prompt-validate vdl/my-validator.yaml`

**Target Directory:** $ARGUMENTS

---

## Pre-Flight

```bash
echo "Running prompt validation on $ARGUMENTS..."
echo "=========================================="
```

Verify the target directory exists:

```bash
test -d "$ARGUMENTS" && echo "✓ Directory exists: $ARGUMENTS" || echo "ERROR: Directory '$ARGUMENTS' not found"
```

Enter and confirm location:

```bash
cd "$ARGUMENTS" && pwd
```

Check file exists:

```bash
[ -f "$ARGUMENTS" ] && echo "✓ $ARGUMENTS found" || echo "Target file does not exist"
```


---

## Agent Invocation

Run the Prompt Validator agent on the validated target directory:

**Agent:** prompt-engineer-agent.md
**Model:** Sonnet
**Target:** $ARGUMENTS

The agent performs code quality validation across 5 categories (100 points total):

| Category | Points | Focus |
|----------|--------|-------|
| Clarity & Specificity | 25 | Mission is unambiguous, success criteria explicit, output format clear |
| Structure & Organization | 20 | Logical flow, consistent formatting, and information hierarchy |
| Completeness | 25 | Edge cases, fallbacks, error handling, examples, and constraints |
| Effectiveness | 20 | Scoring is actionable, criteria measurable, output usable |
| Consistency | 10 | Adherence to project conventions and terminology |

---

## Auto-Fail Conditions

Critical issues that trigger immediate FAIL regardless of score:

| ID | Condition |
|----|-----------|
| **AF-001** | Undefined or vague mission statement |
| **AF-002** | No output format specification |
| **AF-003** | Conflicting instructions in different sections |
| **AF-004** | Subjective-only decision criteria |
| **AF-005** | Missing error/edge case handling |
| **AF-006** | Scoring points that cannot be objectively verified |

---

## Decision Thresholds

| Score | Decision | Meaning |
|-------|----------|---------|
| **>=75** | ✅ PASS | Validation passed, proceed to next phase |
| **<75** | ❌ FAIL | Validation failed, fix issues before proceeding |

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

**CDL Schema:** `udl/definition-languages/cdl-schema-v1.1.0.json`
**CDL Source:** `/home/alexs/uluops/uluops-agent-workflows/udl/cdl/v1/prompt-validate.command.yaml`
**Agent:** `agents/prompt-engineer-agent.md`
