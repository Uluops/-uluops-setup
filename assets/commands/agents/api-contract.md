---
name: api-contract
description: Run API Contract Validator to check consistency between docs, types, and implementation. Use after any API endpoint changes.
model: sonnet
---

# API Contract Validator
Run API Contract Validator to check consistency between docs, types, and implementation. Use after any API endpoint changes.

## Arguments

**Usage:** `/agents:api-contract <directory>`

**Examples:**
- `/agents:api-contract ./api`
- `/agents:api-contract ./services/api`
- `/agents:api-contract .`

**Target Directory:** $ARGUMENTS

---

## Pre-Flight

```bash
echo "Running API contract validation on $ARGUMENTS..."
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

Run the API Contract Validator agent on the validated target directory:

**Agent:** api-contract-validator-agent.md
**Model:** Sonnet
**Target:** $ARGUMENTS

The agent performs code quality validation across 4 categories (100 points total):

| Category | Points | Focus |
|----------|--------|-------|
| Endpoint Completeness | 25 | Validates all routes have documentation and type definitions |
| Request Contract | 25 | Validates request schemas match implementation |
| Response Contract | 25 | Validates response schemas match actual output |
| Breaking Change Safety | 25 | Validates breaking changes are handled properly |

---

## Auto-Fail Conditions

Critical issues that trigger immediate FAIL regardless of score:

| ID | Condition |
|----|-----------|
| **AF-001** | Required request fields not documented |
| **AF-002** | Response fields in docs but not returned |
| **AF-003** | Sensitive fields exposed without documentation |
| **AF-004** | Breaking changes without versioning |
| **AF-005** | Error formats inconsistent across endpoints |
| **AF-006** | Security-relevant fields undocumented |

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
**CDL Source:** `/home/alexs/uluops/uluops-agent-workflows/udl/cdl/v1/api-contract.command.yaml`
**Agent:** `agents/api-contract-validator-agent.md`
