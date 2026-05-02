---
name: aristotle-explorer
description: Performs Aristotelian categorical mapping on any artifact. Identifies what KIND of thing each element is, determines genus and differentia, distinguishes necessary from accidental properties. Produces a taxonomic map of the problem domain.
model: opus
---

# Aristotle Explorer
Performs Aristotelian categorical mapping on any artifact — code, specs, plans, architectures, or documents. Cognitive lens agent from the Cognitive Lens Library.

## Arguments

**Usage:** `/agents:aristotle-explorer <target>`

**Examples:**
- `/agents:aristotle-explorer uluops-registry-api/`
- `/agents:aristotle-explorer udl/adl/v3/code-validator.agent.yaml`
- `/agents:aristotle-explorer docs/specs/cognitive-lens-library-spec.md`
- `/agents:aristotle-explorer packages/cli/`

**Target:** $ARGUMENTS

---

## Pre-Flight

Verify the target exists:

```bash
[ -e "$ARGUMENTS" ] && echo "✓ $ARGUMENTS exists" || echo "Target file or directory does not exist"
```

---

## Agent Invocation

Run the Aristotle Explorer agent on the target:

**Agent:** aristotle-explorer-agent.md
**Model:** Opus
**Target:** $ARGUMENTS

The agent performs Aristotelian categorical mapping through 4 phases:

| Phase | Name | Focus |
|-------|------|-------|
| 1 | Inventory | Read artifact, identify elements, note stated roles |
| 2 | Classification | Identify genus/differentia, destruction-test, accidental properties |
| 3 | Taxonomic Mapping | Build taxonomic tree, find divergences, surface fluid categories |
| 4 | Synthesis | Write complete map, state classifications, note limitations |

**Note:** Explorers produce structured taxonomic maps, not numeric scores. The output is a categorical classification of the artifact's domain.

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
| `buffer.model` | `validators[].model` | From agent-metrics buffer |
| `buffer.tokens.input_tokens` | `input_tokens` | Raw input tokens |
| `buffer.tokens.output_tokens` | `output_tokens` | Output tokens |
| `buffer.tokens.cache_creation_tokens` | `cache_creation_tokens` | Cache creation |
| `buffer.tokens.cache_read_tokens` | `cache_read_tokens` | Cache reads |
| `buffer.tokens.total_effective_tokens` | `total_effective_tokens` | Effective total |

**Note:** `buffer` = `agent-metrics buffer list -f tracker`

---

## Source

**ADL Schema:** `udl/definition-languages/adl-schema-v1.10.0.json`
**ADL Source:** `udl/adl/v3/aristotle-explorer.agent.yaml`
**Agent:** `agents/v3/aristotle-explorer-agent.md`
**Spec:** `docs/specs/cognitive-lens-library-spec.md`
