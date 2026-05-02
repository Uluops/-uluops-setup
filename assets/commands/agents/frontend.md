---
name: frontend
description: Validates React/Tailwind frontend code including accessibility, theme consistency, component composition, and performance. Use AFTER code-validator passes.
model: sonnet
---

# Frontend Validator
Validates React/Tailwind frontend code including accessibility, theme consistency, component composition, and performance. Use AFTER code-validator passes.

## Arguments

**Usage:** `/agents:frontend <directory>`

**Examples:**
- `/agents:frontend ./src/components`
- `/agents:frontend ./app`
- `/agents:frontend .`

**Target Directory:** $ARGUMENTS

---

## Pre-Flight

```bash
echo "Running frontend validation on $ARGUMENTS..."
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

Run the Frontend Validator agent on the validated target directory:

**Agent:** frontend-validator-agent.md
**Model:** Sonnet
**Target:** $ARGUMENTS

The agent performs code quality validation across 5 categories (100 points total):

| Category | Points | Focus |
|----------|--------|-------|
| Component Quality | 25 | Validates single responsibility, typed props, hooks rules, composition patterns |
| Accessibility | 25 | Validates semantic HTML, ARIA labels, keyboard navigation, and focus management |
| Styling & Theme Consistency | 20 | Validates theme-aware patterns, consistent spacing, and responsive design |
| Performance Patterns | 20 | Validates memoization, re-renders, key props, and lazy loading |
| React Best Practices | 10 | Validates useEffect dependencies, cleanup, and error boundaries |

---

## Auto-Fail Conditions

Critical issues that trigger immediate FAIL regardless of score:

| ID | Condition |
|----|-----------|
| **AF-001** | Keyboard-inaccessible interactive elements |
| **AF-002** | Using dark: prefixes (violates project theme system) |
| **AF-003** | Images without alt text |
| **AF-004** | API calls in presentation components |
| **AF-005** | useEffect with side effects but no cleanup |

---

## Decision Thresholds

| Score | Decision | Meaning |
|-------|----------|---------|
| **>=85** | ✅ PASS | Validation passed, proceed to next phase |
| **<85** | ❌ FAIL | Validation failed, fix issues before proceeding |

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
**CDL Source:** `/home/alexs/uluops/uluops-agent-workflows/udl/cdl/v1/frontend.command.yaml`
**Agent:** `agents/frontend-validator-agent.md`
