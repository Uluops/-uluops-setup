---
name: docs-validate
description: Validates comprehensive documentation quality including JSDoc/TSDoc, API specs, changelog, and markdown. Complements public-interface for projects with significant documentation.
---

# Documentation Validator
Validates comprehensive documentation quality including JSDoc/TSDoc, API specs, changelog, and markdown. Complements public-interface for projects with significant documentation.

## Arguments

**Usage:** `/agents:docs-validate <directory>`

**Examples:**
- `/agents:docs-validate ./docs`
- `/agents:docs-validate .`
- `/agents:docs-validate ./packages/api`

**Target Directory:** $ARGUMENTS

---

## Pre-Flight

```bash
echo "Running documentation validation on $ARGUMENTS..."
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

Run the Documentation Validator agent on the validated target directory:

**Agent:** docs-validator-agent.md
**Model:** Sonnet
**Target:** $ARGUMENTS

The agent performs code quality validation across 5 categories (100 points total):

| Category | Points | Focus |
|----------|--------|-------|
| JSDoc/TSDoc Coverage | 30 | Public exports have complete, accurate documentation comments |
| API Documentation | 25 | OpenAPI/Swagger specs accurate and complete for API projects |
| Changelog Quality | 15 | CHANGELOG.md follows conventions and tracks changes accurately |
| Markdown Quality | 15 | Markdown files are well-formed with valid links |
| Documentation Organization | 15 | Documentation is discoverable and well-organized |

---

## Auto-Fail Conditions

Critical issues that trigger immediate FAIL regardless of score:

| ID | Condition |
|----|-----------|
| **** | No JSDoc on any public exports |
| **** | API spec significantly out of sync with implementation |
| **** | Major version release not in changelog |

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
**CDL Source:** `/home/alexs/uluops/uluops-agent-workflows/udl/cdl/v1/docs-validate.command.yaml`
**Agent:** `agents/docs-validator-agent.md`
