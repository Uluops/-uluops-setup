---
name: optimize
description: Run Optimizer agent on a project/directory. Analyzes structure, performance, bundle hygiene, and maintainability. Reports only - does not auto-apply changes.
---

# Code Optimizer
Run Optimizer agent on a project/directory. Analyzes structure, performance, bundle hygiene, and maintainability. Reports only - does not auto-apply changes.

## Arguments

**Usage:** `/agents:optimize <directory>`

**Examples:**
- `/agents:optimize ./src`
- `/agents:optimize ./packages/api`
- `/agents:optimize .`

**Target Directory:** $ARGUMENTS

---

## Pre-Flight

```bash
echo "Running code optimization analysis on $ARGUMENTS..."
echo "==================================================="
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

Run the Code Optimizer agent on the validated target directory:

**Agent:** code-optimizer-agent.md
**Model:** Sonnet
**Target:** $ARGUMENTS

The agent performs code quality validation across 4 categories (100 points total):

| Category | Points | Focus |
|----------|--------|-------|
| Structure & Duplication | 30 | Code organization, DRY principles, module responsibilities |
| Performance & Hot Paths | 25 | Async patterns, allocations, request handling, retry logic |
| Bundle & Dependencies | 20 | Unused code removal, dependency hygiene, tree-shaking |
| Readability & Maintainability | 25 | Naming, function size, comments, types, code style |

---

## Auto-Fail Conditions

Critical issues that trigger immediate FAIL regardless of score:

| ID | Condition |
|----|-----------|
| **AF-001** | Recommended refactor would change public API signatures |
| **AF-002** | Refactor requires modifying tests to pass |
| **AF-003** | Performance optimization trades correctness for speed |
| **AF-004** | Unsafe memory patterns or race conditions introduced |

---

## Decision Thresholds

| Score | Decision | Meaning |
|-------|----------|---------|
| **>=80** | ✅ PASS | Validation passed, proceed to next phase |
| **<80** | ❌ FAIL | Validation failed, fix issues before proceeding |

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
**CDL Source:** `/home/alexs/uluops/uluops-agent-workflows/udl/cdl/v1/optimize.command.yaml`
**Agent:** `agents/code-optimizer-agent.md`
