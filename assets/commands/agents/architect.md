---
name: architect
description: Run Pre-Implementation Architect to validate design before coding. Reviews architectural fit, complexity, scope. Use BEFORE starting implementation.
model: opus
---

# Pre-Implementation Architect
Run Pre-Implementation Architect to validate design before coding. Reviews architectural fit, complexity, scope. Use BEFORE starting implementation.

## Arguments

**Usage:** `/agents:architect <directory>`

**Examples:**
- `/agents:architect ./docs/design.md`
- `/agents:architect ./PRD.md`
- `/agents:architect .`

**Target Directory:** $ARGUMENTS

---

## Pre-Flight

```bash
echo "Running architecture review on $ARGUMENTS..."
echo "============================================"
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

Run the Pre-Implementation Architect agent on the validated target directory:

**Agent:** pre-implementation-architect-agent.md
**Model:** Sonnet
**Target:** $ARGUMENTS

The agent performs code quality validation across 4 categories (100 points total):

| Category | Points | Focus |
|----------|--------|-------|
| Architectural Fit | 25 | Follows existing patterns, consistent conventions, clean integration |
| Design Quality | 25 | Single responsibility, separation of concerns, balanced abstraction levels |
| Scope & Complexity | 25 | Phase sized within limits (<500 LOC, <10 files, <3 deps), complexity justified, simpler alternatives considered |
| Completeness | 25 | Edge cases, error scenarios, data flow, API contracts, testing strategy |

---

## Auto-Fail Conditions

Critical issues that trigger immediate FAIL regardless of score:

| ID | Condition |
|----|-----------|
| **AF-001** | Design contradicts existing architecture without justification |
| **AF-002** | Missing error handling strategy for critical paths |
| **AF-003** | Scope too large for single implementation phase |
| **AF-004** | Circular dependencies would be introduced |
| **AF-005** | No clear data flow or API contracts |
| **AF-006** | Breaking changes without migration strategy |

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
**CDL Source:** `/home/alexs/uluops/uluops-agent-workflows/udl/cdl/v1/architect.command.yaml`
**Agent:** `agents/pre-implementation-architect-agent.md`
