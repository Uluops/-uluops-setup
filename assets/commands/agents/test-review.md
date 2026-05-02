---
name: test-review
description: Run Test Architect agent to validate test quality and coverage. Use after implementation passes code validator.
model: sonnet
---

# Test Architect
Run Test Architect agent to validate test quality and coverage. Use after implementation passes code validator.

## Arguments

**Usage:** `/agents:test-review <directory>`

**Examples:**
- `/agents:test-review ./tests`
- `/agents:test-review ./src`
- `/agents:test-review .`

**Target Directory:** $ARGUMENTS

---

## Pre-Flight

```bash
echo "Running test architecture review on $ARGUMENTS..."
echo "================================================="
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

Run the Test Architect agent on the validated target directory:

**Agent:** test-architect-agent.md
**Model:** Sonnet
**Target:** $ARGUMENTS

The agent performs code quality validation across 5 categories (100 points total):

| Category | Points | Focus |
|----------|--------|-------|
| Coverage Quality | 30 | Public function coverage, edge cases, error conditions, boundaries |
| Test Design | 25 | Behavior verification, single purpose, naming, AAA pattern |
| Test Independence | 20 | Order independence, no shared state, isolation, proper scoping |
| Mutation Resistance | 15 | Tests catch logic inversions, boundary errors, removed validation |
| Maintainability | 10 | No magic values, meaningful test data, appropriate DRY |

---

## Auto-Fail Conditions

Critical issues that trigger immediate FAIL regardless of score:

| ID | Condition |
|----|-----------|
| **AF-001** | Core functionality has no tests |
| **AF-002** | Tests pass regardless of implementation correctness |
| **AF-003** | Tests are coupled to implementation details |
| **AF-004** | Non-deterministic (flaky) tests detected |
| **AF-005** | Shared state causing test interference |
| **AF-006** | Error paths completely untested |

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

**CDL Schema:** `udl/definition-languages/cdl-schema-v1.1.0.json`
**CDL Source:** `/home/alexs/uluops/uluops-agent-workflows/udl/cdl/v1/test-review.command.yaml`
**Agent:** `agents/test-architect-agent.md`
