---
name: type-safety
description: Run Type Safety Validator on TypeScript projects. Validates beyond tsc—catches any abuse, unsafe assertions, type holes that pass compilation but cause runtime failures.
model: sonnet
---

# Type Safety Validator
Run Type Safety Validator on TypeScript projects. Validates beyond tsc—catches any abuse, unsafe assertions, type holes that pass compilation but cause runtime failures.

## Arguments

**Usage:** `/agents:type-safety <directory>`

**Examples:**
- `/agents:type-safety ./src`
- `/agents:type-safety ./packages/api`
- `/agents:type-safety .`

**Target Directory:** $ARGUMENTS

---

## Pre-Flight

```bash
echo "Running type safety validation on $ARGUMENTS..."
echo "==============================================="
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

Run the Type Safety Validator agent on the validated target directory:

**Agent:** type-safety-validator-agent.md
**Model:** Sonnet
**Target:** $ARGUMENTS

The agent performs code quality validation across 5 categories (100 points total):

| Category | Points | Focus |
|----------|--------|-------|
| Any Usage | 25 | Tracks explicit any, implicit any, and any isolation at boundaries |
| Type Assertions | 25 | Validates safe use of as casts, non-null assertions, and suppressions |
| Strict Mode Compliance | 20 | Validates strictNullChecks patterns, optional handling, union narrowing |
| Generic & Complex Types | 15 | Validates generic constraints, type complexity, utility type usage |
| Export Type Quality | 15 | Validates public API type accuracy, explicitness, and consumer safety |

---

## Auto-Fail Conditions

Critical issues that trigger immediate FAIL regardless of score:

| ID | Condition |
|----|-----------|
| **AF-001** | any in exported function signatures |
| **AF-002** | Double assertions (as unknown as Type) |
| **AF-003** | @ts-ignore on security/auth code without justification |
| **AF-004** | strict: false in tsconfig for library code |
| **AF-005** | Non-null assertions on untrusted/external data |

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
**CDL Source:** `/home/alexs/uluops/uluops-agent-workflows/udl/cdl/v1/type-safety.command.yaml`
**Agent:** `agents/type-safety-validator-agent.md`
