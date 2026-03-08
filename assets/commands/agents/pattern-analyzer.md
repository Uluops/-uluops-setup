---
name: pattern-analyzer
description: Analyzes ecosystem-wide patterns across all agents, commands, and workflows. Detects conventions, identifies inconsistencies, and learns from validation failures.
---

# Pattern Analyzer
Analyzes ecosystem-wide patterns across all agents, commands, and workflows. Detects conventions, identifies inconsistencies, and learns from validation failures.

## Arguments

**Usage:** `/agents:pattern-analyzer <directory>`

**Examples:**
- `/agents:pattern-analyzer agents/`
- `/agents:pattern-analyzer commands/`
- `/agents:pattern-analyzer .`

**Target Directory:** $ARGUMENTS

---

## Pre-Flight

```bash
echo "Running pattern analysis..."
echo "==========================="
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

Run the Pattern Analyzer agent on the validated target directory:

**Agent:** prompt-pattern-analyzer-agent.md
**Model:** Sonnet
**Target:** $ARGUMENTS

The agent performs code quality validation across 4 categories (100 points total):

| Category | Points | Focus |
|----------|--------|-------|
| Convention Extraction | 25 | Identifies scoring frameworks, decision keywords, thresholds, and structural patterns |
| Consistency Analysis | 30 | Measures terminology variance, flags outliers, quantifies drift |
| Evolution Opportunities | 25 | Identifies redundancy, refactoring opportunities, and emerging best practices |
| Failure Pattern Learning | 20 | Analyzes historical audit scores and extracts common failure modes |

---

## Auto-Fail Conditions

Critical issues that trigger immediate FAIL regardless of score:

| ID | Condition |
|----|-----------|
| **AF-001** | Fewer than 5 agents in ecosystem |
| **AF-002** | No agents discovered at expected paths |
| **AF-003** | High variance prevents pattern extraction |

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
**CDL Source:** `/home/alexs/uluops/uluops-agent-workflows/udl/cdl/v1/pattern-analyzer.command.yaml`
**Agent:** `agents/prompt-pattern-analyzer-agent.md`
