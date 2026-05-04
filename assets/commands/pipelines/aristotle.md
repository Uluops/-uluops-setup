---
name: aristotle-pipeline
description: Sequential four-phase Aristotelian analysis. Explorer maps categories, Analyst decomposes four causes, Validator checks teleological alignment, Forecaster projects actualization trajectory. Each phase builds on the previous.
tools: Read, Grep, Glob, Bash
model: opus
---

# Aristotle Pipeline

> Sequential four-phase Aristotelian analysis. Explorer maps categories, Analyst decomposes four causes, Validator checks teleological alignment, Forecaster projects actualization trajectory. Each phase builds on the previous.

| Field | Value |
|-------|-------|
| Name | `aristotle-pipeline` |
| Version | 1.0.0 |
| Domain | software |
| Subdomain | cognitive-lens |
| Tags | `cognitive-lens`, `aristotle`, `philosophy`, `sequential` |

## Triggers

- **Manual**
  - Parameters:
    - `target`: string

## Stage Dependency Graph

```
explore (Categorical Mapping)
  -> analyze (Four-Cause Decomposition)
    -> validate (Teleological Alignment)
      -> forecast (Actualization Projection)
        -> synthesis (Cross-Phase Synthesis)
```

## Stages

### Stage 1: Categorical Mapping

- **ID:** `explore`

**Agents:**
- `aristotle-explorer`

**Gate:**
- Threshold: 70
- On failure: warn

### Stage 2: Four-Cause Decomposition

- **ID:** `analyze`
- **Depends on:** `explore`

**Agents:**
- `aristotle-analyst`

**Gate:**
- Threshold: 70
- On failure: warn

### Stage 3: Teleological Alignment

- **ID:** `validate`
- **Depends on:** `analyze`

**Agents:**
- `aristotle-validator`

**Gate:**
- Threshold: 70
- On failure: warn

### Stage 4: Actualization Projection

- **ID:** `forecast`
- **Depends on:** `validate`

**Agents:**
- `aristotle-forecaster`

**Gate:**
- Threshold: 70
- On failure: warn

### Stage 5: Cross-Phase Synthesis

- **ID:** `synthesis`
- **Depends on:** `forecast`

**Agents:**
- `workflow-synthesis`

**Gate:**
- Threshold: 0
- On failure: warn

## Postflight

### Tracker Persistence

After all stages complete, save results to the tracker using `save_features_list`:

- **definition_type:** `pipeline`
- **definition_name:** `aristotle-pipeline`
- **definition_version:** `1.0.0`
- **workflow_type:** `cognitive-lens`
- **project:** `$ARGUMENTS` (the target project name)
- **validators:** Collect each validator/agent result with name, score, status, model, and token usage
- **recommendations:** Collect ALL issues from ALL stages into a single recommendations array with validator, title, priority, severity, failure_code, file_path, line_number, description, and type
- **summary:** `{ all_gates_passed: <true if all abort-gates passed>, average_score: <mean of all validator scores> }`

This MUST be a single bulk call — do NOT create individual issues. The `save_features_list` tool auto-increments the run number and detects regressions from prior runs.

**Token Metrics:**

Get token metrics from the agent-metrics buffer before saving:
```bash
agent-metrics buffer list --since 15m -f tracker
```

Map buffer fields to tracker: `input_tokens`, `output_tokens`, `cache_creation_tokens`, `cache_read_tokens`, `total_effective_tokens`, and `model`.

**Field Mappings:**

| Source | Tracker Field | Notes |
|--------|---------------|-------|
| `stage.gate.score` | `agents[].score` | Total score |
| `stage.gate.decision` | `agents[].decision` | Agent decision |
| `agent-metrics` | `agents[].model` | Model identifier |
| `stage.output.issues` | `recommendations[]` | Flatten nested structure |

**Verification:** After saving, compare `json.summary.total_issues` with the saved count. Alert if mismatch.

### On Success

- **ACTUALIZED — Full Aristotelian analysis complete.**

### On Failure

- **POTENTIAL — Significant ontological gaps remain.**

---
*Generated from PDL v1.0.0 | Pipeline: aristotle-pipeline*
