---
name: aristotle-validator
description: Performs Aristotelian teleological alignment validation on any artifact. Checks whether means are properly ordered toward ends, whether components fulfill their natural function, and whether category errors exist. Decision: ALIGNED/MISALIGNED.
---

# Aristotle Validator
Performs Aristotelian teleological alignment validation on any artifact — code, specs, plans, architectures, or documents. Cognitive lens agent from the Cognitive Lens Library.

## Arguments

**Usage:** `/agents:aristotle-validator <target>`

**Examples:**
- `/agents:aristotle-validator uluops-registry-api/`
- `/agents:aristotle-validator udl/adl/v3/code-validator.agent.yaml`
- `/agents:aristotle-validator docs/specs/cognitive-lens-library-spec.md`
- `/agents:aristotle-validator packages/cli/`

**Target:** $ARGUMENTS

---

## Pre-Flight

Verify the target exists:

```bash
[ -e "$ARGUMENTS" ] && echo "✓ $ARGUMENTS exists" || echo "Target file or directory does not exist"
```

---

## Agent Invocation

Run the Aristotle Validator agent on the target:

**Agent:** aristotle-validator-agent.md
**Model:** Opus
**Target:** $ARGUMENTS

The agent performs Aristotelian teleological alignment across 5 categories (100 points total):

| Category | Points | Focus |
|----------|--------|-------|
| Teleological Coherence | 25 | Telos identified, means-end chain traced, misalignment surfaced |
| Categorical Correctness | 25 | Category errors detected, natural function assessed |
| Essential/Accidental Distinction | 20 | Essential properties preserved, accidentals not treated as essential |
| Four-Cause Completeness | 15 | Causal grounding, efficient/final causes distinguished |
| Potentiality Assessment | 15 | Actualization trajectory, impediments identified |

## Auto-Fail Conditions

| ID | Condition | Severity |
|----|-----------|----------|
| AF-001 | No genuine teleological alignment assessment performed | Critical |
| AF-002 | Telos assumed rather than identified and defended | Critical |
| AF-003 | Technical quality evaluation substituted for teleological alignment | Critical |
| AF-004 | No category error detection performed | Critical |

---

## Decision Thresholds

| Score | Decision | Meaning |
|-------|----------|---------|
| **>=70** | ALIGNED | Artifact's components are coherently ordered toward an identifiable telos |
| **<70** | MISALIGNED | Components serve unclear or contradictory purposes, or analysis is incomplete |

**Note:** This is an advisory decision, not a deployment gate. ALIGNED means the artifact's parts serve a coherent purpose — not that the artifact is correct or desirable.

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
| `json.result.decision` | `validators[].status` | ALIGNED/MISALIGNED |
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

**ADL Schema:** `udl/definition-languages/adl-schema-v1.10.0.json`
**ADL Source:** `udl/adl/v3/aristotle-validator.agent.yaml`
**Agent:** `agents/v3/aristotle-validator-agent.md`
**Spec:** `docs/specs/cognitive-lens-library-spec.md`
