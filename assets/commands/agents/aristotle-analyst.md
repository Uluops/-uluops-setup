---
name: aristotle-analyst
description: Performs Aristotelian four-cause decomposition on any artifact. Identifies material, formal, efficient, and final causes. Distinguishes essential from accidental properties. Assesses telos coherence. Decision: TELEOLOGICAL/ATELEOLOGICAL.
---

# Aristotle Analyst
Performs Aristotelian four-cause decomposition on any artifact — code, specs, plans, architectures, or documents. First cognitive lens agent from the Cognitive Lens Library.

## Arguments

**Usage:** `/agents:aristotle-analyst <target>`

**Examples:**
- `/agents:aristotle-analyst uluops-registry-api/`
- `/agents:aristotle-analyst udl/adl/v3/code-validator.agent.yaml`
- `/agents:aristotle-analyst docs/specs/cognitive-lens-library-spec.md`
- `/agents:aristotle-analyst packages/cli/`

**Target:** $ARGUMENTS

---

## Pre-Flight

Verify the target exists:

```bash
[ -e "$ARGUMENTS" ] && echo "✓ $ARGUMENTS exists" || echo "Target file or directory does not exist"
```

---

## Agent Invocation

Run the Aristotle Analyst agent on the target:

**Agent:** aristotle-analyst-agent.md
**Model:** Opus
**Target:** $ARGUMENTS

The agent performs Aristotelian decomposition across 5 categories (100 points total):

| Category | Points | Focus |
|----------|--------|-------|
| Four-Cause Completeness | 25 | Material, formal, efficient, final causes per element |
| Telos Coherence | 25 | Purpose identified, defended, served by parts |
| Essential/Accidental | 20 | Properties classified with destruction-test justification |
| Categorical Classification | 15 | Genus and differentia identified |
| Potentiality-Actuality | 15 | Current state vs. unrealized potential |

## Auto-Fail Conditions

| ID | Condition | Severity |
|----|-----------|----------|
| AF-001 | No genuine four-cause decomposition performed | Critical |
| AF-002 | Efficient and final causes systematically conflated | Critical |
| AF-003 | Telos is circular or tautological | Critical |
| AF-004 | Essential/accidental not distinguished | Critical |
| AF-005 | Generic analysis relabeled with Aristotelian terms | Critical |

---

## Decision Thresholds

| Score | Decision | Meaning |
|-------|----------|---------|
| **>=70** | TELEOLOGICAL | Artifact has coherent causal structure ordered toward identifiable telos |
| **<70** | ATELEOLOGICAL | Artifact's telos is unclear, contradicted, or analysis incomplete |

**Note:** This is an advisory decision, not a deployment gate. TELEOLOGICAL means the artifact's parts serve a coherent purpose — not that the artifact is correct or desirable.

---

## PERSIST TO TRACKER (Required)

> **IMPORTANT:** Save to tracker IMMEDIATELY after agent completes, BEFORE presenting the summary to the user.

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
| `json.result.decision` | `validators[].status` | TELEOLOGICAL/ATELEOLOGICAL |
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

**ADL Schema:** `udl/definition-languages/adl-schema-v1.9.0.json`
**ADL Source:** `udl/adl/v3/aristotle-analyst.agent.yaml`
**Agent:** `agents/v3/aristotle-analyst-agent.md`
**Spec:** `docs/specs/cognitive-lens-library-spec.md`
