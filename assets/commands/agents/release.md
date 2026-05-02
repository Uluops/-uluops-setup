---
name: release
description: Final release gate for packages and CLI tools. Validates version consistency, CLI --version, package.json, and docs. Detects semantic-release CI/CD vs manual publishing.
model: sonnet
---

# Release Readiness
Final release gate for packages and CLI tools. Validates version consistency, CLI --version, package.json, and docs. Detects semantic-release CI/CD vs manual publishing.

## Arguments

**Usage:** `/agents:release <directory>`

**Examples:**
- `/agents:release ./packages/sdk`
- `/agents:release .`
- `/agents:release ./lib`

**Target Directory:** $ARGUMENTS

---

## Pre-Flight

```bash
echo "Running release readiness check on $ARGUMENTS..."
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

Run the Release Readiness agent on the validated target directory:

**Agent:** release-readiness-agent.md
**Model:** Sonnet
**Target:** $ARGUMENTS

The agent performs code quality validation across 4 categories (100 points total):

| Category | Points | Focus |
|----------|--------|-------|
| Version Consistency | 25 | Validates package.json version matches CLI output and CHANGELOG |
| Package Configuration | 25 | Validates package.json fields, exports, and entry points |
| Documentation | 25 | Validates README, CHANGELOG, and API documentation |
| Release Hygiene | 25 | Validates no debug code, no secrets, fresh build |

---

## Auto-Fail Conditions

Critical issues that trigger immediate FAIL regardless of score:

| ID | Condition |
|----|-----------|
| **** | CLI --version does not match package.json version |
| **** | Missing CHANGELOG entry for current version |
| **** | Secrets or API keys in codebase |
| **** | README.md is missing |
| **** | Build artifacts stale or missing |
| **** | console.log in production paths (for libraries) |

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
**CDL Source:** `/home/alexs/uluops/uluops-agent-workflows/udl/cdl/v1/release.command.yaml`
**Agent:** `agents/release-readiness-agent.md`
