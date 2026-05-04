---
name: code-validate
description: Validates code quality, standards compliance, and test coverage. Use after each implementation phase.
model: sonnet
---

# Code Validator
Validates code quality, standards compliance, and test coverage. Use after each implementation phase.

## Arguments

**Usage:** `/agents:code-validate <directory>`

**Examples:**
- `/agents:code-validate ./services/auth-service`
- `/agents:code-validate ./packages/api`
- `/agents:code-validate .`

**Target Directory:** $ARGUMENTS

---

## Pre-Flight

```bash
echo "Running code validation on $ARGUMENTS..."
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

Run the Code Validator agent on the validated target directory:

**Agent:** code-validator-agent.md
**Model:** Sonnet
**Target:** $ARGUMENTS

The agent performs code quality validation across 4 categories (100 points total):

| Category | Points | Focus |
|----------|--------|-------|
| Code Quality | 30 | Function design, naming, duplication, error handling, complexity |
| Standards Compliance | 25 | Style guide adherence, formatting, imports, documentation |
| Testing | 25 | Unit tests, edge cases, behavior verification, test execution |
| Best Practices | 20 | Security basics, performance, separation of concerns, dependencies |

---

## Auto-Fail Conditions

Critical issues that trigger immediate FAIL regardless of score:

| ID | Condition |
|----|-----------|
| **AF-001** | Security vulnerabilities detected |
| **AF-002** | Missing error handling in critical paths |
| **AF-003** | Code does not function |
| **AF-004** | Missing tests for core functionality |
| **AF-005** | Breaking changes without migration path |

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
**1. Save to tracker (REQUIRED):**

```bash
agent-metrics buffer list --since 5m -f tracker
```

mcp__uluops-tracker__save_run

**2. Verify saved:** Compare `json.summary.total_issues` with saved count.

**3. THEN present summary to user.**


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
**CDL Source:** `/home/alexs/uluops/uluops-agent-workflows/udl/cdl/v1/validate.command.yaml`
**Agent:** `agents/code-validator-agent.md`
