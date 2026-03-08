---
name: audit
description: Deep runtime correctness audit. Catches async bugs, null dereferences, silent failures, and edge cases that pass all other validators. Use as FINAL gate before ship.
---

# Code Auditor
Deep runtime correctness audit. Catches async bugs, null dereferences, silent failures, and edge cases that pass all other validators. Use as FINAL gate before ship.

## Arguments

**Usage:** `/agents:audit <directory>`

**Examples:**
- `/agents:audit ./src`
- `/agents:audit ./packages/core`
- `/agents:audit .`

**Target Directory:** $ARGUMENTS

---

## Pre-Flight

```bash
echo "Running deep code audit on $ARGUMENTS..."
echo "========================================"
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

Run the Code Auditor agent on the validated target directory:

**Agent:** code-auditor-agent.md
**Model:** Opus
**Target:** $ARGUMENTS

The agent performs code quality validation across 5 categories (100 points total):

| Category | Points | Focus |
|----------|--------|-------|
| Async Safety | 25 | Validates asynchronous operations complete correctly and errors propagate |
| Null/Undefined Safety | 25 | Validates optional values are handled before use |
| Error Handling | 20 | Validates errors are caught, preserved, and propagated correctly |
| Data Integrity | 15 | Validates data transformations preserve correctness |
| API Boundary Safety | 15 | Validates external data and services handled defensively |

---

## Auto-Fail Conditions

Critical issues that trigger immediate FAIL regardless of score:

| ID | Condition |
|----|-----------|
| **AF-001** | Unhandled promise rejection in production path |
| **AF-002** | Empty catch block in error-critical code |
| **AF-003** | .find() result used without null check |
| **AF-004** | JSON.parse on external data without try/catch |
| **AF-005** | Fire-and-forget async that could lose user data |
| **AF-006** | Silent failure that corrupts state |

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
**CDL Source:** `/home/alexs/uluops/uluops-agent-workflows/udl/cdl/v1/audit.command.yaml`
**Agent:** `agents/code-auditor-agent.md`
