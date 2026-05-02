---
name: aristotle-forecaster
description: Performs Aristotelian potentiality-to-actuality projection on any artifact. Maps trajectory from current state to full actualization, identifies impediments to telos realization. Decision: HIGH_CONFIDENCE/MODERATE_CONFIDENCE/LOW_CONFIDENCE.
model: opus
---

# Aristotle Forecaster
Performs Aristotelian potentiality-to-actuality projection on any artifact — code, specs, plans, architectures, or documents. Cognitive lens agent from the Cognitive Lens Library.

## Arguments

**Usage:** `/agents:aristotle-forecaster <target>`

**Examples:**
- `/agents:aristotle-forecaster uluops-registry-api/`
- `/agents:aristotle-forecaster udl/adl/v3/code-validator.agent.yaml`
- `/agents:aristotle-forecaster docs/specs/cognitive-lens-library-spec.md`
- `/agents:aristotle-forecaster packages/cli/`

**Target:** $ARGUMENTS

---

## Pre-Flight

Verify the target exists:

```bash
[ -e "$ARGUMENTS" ] && echo "✓ $ARGUMENTS exists" || echo "Target file or directory does not exist"
```

---

## Agent Invocation

Run the Aristotle Forecaster agent on the target:

**Agent:** aristotle-forecaster-agent.md
**Model:** Opus
**Target:** $ARGUMENTS

The agent performs Aristotelian potentiality-to-actuality projection across 5 categories (100 points total):

| Category | Points | Focus |
|----------|--------|-------|
| Potentiality Identification | 25 | Latent capabilities, structural grounding, potentiality vs possibility |
| Actualization Pathways | 25 | Pathway specificity, natural ordering, form alignment |
| Impediment Analysis | 20 | Structural impediments (not resource constraints), actionable specificity |
| Teleological Trajectory | 15 | Movement toward/away from telos, potentiality-telos connection |
| Temporal Precision | 15 | Actualization stages, current position on trajectory |

## Auto-Fail Conditions

| ID | Condition | Severity |
|----|-----------|----------|
| AF-001 | Feature requests presented as potentiality analysis | Critical |
| AF-002 | Impediments listed as resource constraints rather than structural barriers | Critical |
| AF-003 | No connection between potentialities and artifact's telos | Critical |

---

## Decision Thresholds

| Score | Decision | Meaning |
|-------|----------|---------|
| **>=75** | HIGH_CONFIDENCE | Trajectory is clear, potentialities well-mapped, impediments specific |
| **50-74** | MODERATE_CONFIDENCE | Trajectory partially clear, some potentialities uncertain |
| **<50** | LOW_CONFIDENCE | Trajectory unclear, insufficient structural evidence for projection |

**Note:** This is an advisory decision. HIGH_CONFIDENCE means the artifact's trajectory is well-understood — not that the trajectory is desirable.

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
| `json.result.decision` | `validators[].status` | HIGH_CONFIDENCE/MODERATE_CONFIDENCE/LOW_CONFIDENCE |
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
**ADL Source:** `udl/adl/v3/aristotle-forecaster.agent.yaml`
**Agent:** `agents/v3/aristotle-forecaster-agent.md`
**Spec:** `docs/specs/cognitive-lens-library-spec.md`
