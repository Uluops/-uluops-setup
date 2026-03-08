---
name: public-interface
description: Validates public-facing quality - README accuracy, unused imports, dead code, export hygiene, error messages. Use AFTER test-architect passes.
---

# Public Interface Validator
Validates public-facing quality - README accuracy, unused imports, dead code, export hygiene, error messages. Use AFTER test-architect passes.

## Arguments

**Usage:** `/agents:public-interface <directory>`

**Examples:**
- `/agents:public-interface ./packages/sdk`
- `/agents:public-interface ./lib`
- `/agents:public-interface .`

**Target Directory:** $ARGUMENTS

---

## Pre-Flight

```bash
echo "Running public interface validation on $ARGUMENTS..."
echo "===================================================="
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

Run the Public Interface Validator agent on the validated target directory:

**Agent:** public-interface-validator-agent.md
**Model:** Sonnet
**Target:** $ARGUMENTS

The agent performs code quality validation across 5 categories (100 points total):

| Category | Points | Focus |
|----------|--------|-------|
| Feature Completeness | 30 | All major capabilities documented in README with examples |
| Documentation Accuracy | 25 | README examples work and match current API |
| Code Hygiene | 20 | Clean code without dead weight |
| Export Quality | 15 | Public exports are documented and intentional |
| Consumer Experience | 10 | Library is pleasant to use |

---

## Auto-Fail Conditions

Critical issues that trigger immediate FAIL regardless of score:

| ID | Condition |
|----|-----------|
| **AF-001** | No README.md exists |
| **AF-002** | Major feature completely missing from README |
| **AF-003** | README examples reference non-existent exports |
| **AF-004** | README title/description misleading about capabilities |

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
**CDL Source:** `/home/alexs/uluops/uluops-agent-workflows/udl/cdl/v1/public-interface.command.yaml`
**Agent:** `agents/public-interface-validator-agent.md`
