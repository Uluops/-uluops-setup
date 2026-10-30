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
| Version | 1.0.3 |
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

## Execution Rules

These rules are normative (PDL 1.6.0 specification, *Execution Semantics*). Follow them exactly; where a stage below is silent, these decide.

**Stage status.** Every stage ends in exactly one status:
- `PASSED`: it ran and its gate passed (or it has no gate, every step succeeded and no agent was unjudgeable).
- `WARNED`: it ran and a `warn` gate failed; or a step failed behind a `warn` gate or in a stage with no gate; or a stage with no gate has an agent whose decision is negative.
- `FAILED`: a blocking gate failed, or a step without continue-on-error failed behind a blocking gate.
- `SKIPPED`: it did not run, because its condition was false, every agent in it was skipped by its own condition, a stage it depends on (directly or transitively) ended FAILED or ERRORED behind `abort`, or the run was stopped before it launched.
- `ERRORED`: it could not be judged: an agent was unjudgeable (no score and no classifiable decision; or no score at a gate that has a threshold; a timeout included), a condition ended as an error value (below), or the stage was in flight when the run was stopped.
- Report every ERRORED stage as `STAGE_ERRORED` with the stage and the reason: `agent_unjudgeable` for an unjudgeable agent, `condition_error` for a condition, `stopped` for a stop. An ERRORED stage takes its gate's failure mode.

**Dependencies.** Launch a stage once every stage in its `depends_on` has a terminal status. Any status satisfies, except that a stage downstream of one that ended FAILED or ERRORED behind `abort` is SKIPPED. A stage receives the results of its direct dependencies (unless one forwards nothing or it receives nothing, as marked below). A dependency that produced no output is passed on as `### <id> — no output (<reason>)`: `condition_not_met` for a stage its condition skipped, otherwise the failure's error text.

**Failure modes.** `abort` (the default): the stage is FAILED and its transitive dependents are SKIPPED; every other stage still runs. `fail`: FAILED, and the run continues. `warn`: WARNED, and the run continues. `skip` is a deprecated name for `fail`. A stage with no gate never fails the run: it is WARNED instead, and an ERRORED stage with no gate counts as WARNED. `abort`, `fail` and `skip` are blocking; `warn` is not. Never relaunch an agent because of its decision or score; relaunch only an agent that failed to start.

**Reading an agent's result.** Read only these; nothing else in the output counts.
- Decision: the JSON value at `result.decision`, else the top-level `decision`, else the agent's `Decision:` line. A JSON value that does not classify never overrides a `Decision:` line that does; when both classify and disagree, the JSON value is used (`DECISION_CONFLICT`).
- Score: `result.score`, else the top-level `score`, else the number on the agent's `Score:` line. It must be a number from 0 to 100, or a string that is exactly such a number (`"85"`); anything else there is no score (`SCORE_INVALID`).
- A decision or score found anywhere else is shown but does not count: the decision is absent (`FALLBACK_DECISION_SOURCE`), the score is none (`FALLBACK_SCORE_SOURCE`).
- Token: cut the decision to 200 characters, drop leading characters that are not letters, and take the first run of letters, digits and underscores, upper-cased. It counts only when followed by the end of the value, closing punctuation (`)` `]` `.` `,` `:` `;` `!` `*`), or whitespace and then a non-letter or the end of the value. Otherwise the decision is neutral: `NOT SECURE`, `SECURE WITH CONDITIONS` and an unfilled `[A|B]` placeholder are neutral.
- Class: look the token up in the agent's `decision_vocabulary` (its frontmatter), then in this register. Positive: `PASS` `SHIP` `COMPLETE` `EXPLORED` `APPROVED` `PROCEED`. Negative: `FAIL` `FAILED` `BLOCK` `BLOCKED`. Conditional: `WARN` `HOLD` `PARTIAL`. Any other token is neutral; synonyms such as `OK` or `REJECT` are neutral.
- Save each agent's decision as the token when it classifies; otherwise the value as written, whitespace collapsed, cut to 50 characters (the first 49 and `…` when longer); `UNKNOWN` when there is no decision.

**Gates.** A gate judges the agents its stage ran (not those their own condition skipped).
- Score: with per-agent thresholds, each agent must reach its own threshold (or the gate's, as a fallback). Otherwise the aggregate of the scores (`min` unless stated) must reach the gate threshold. A gate with no threshold compares decisions only.
- Decision `not_negative` (the default on a blocking gate): a negative fails the gate; a conditional passes it, and at a blocking gate `all_gates_passed` becomes false (`CONDITIONAL_ACCEPTED`). `positive`: a negative or a conditional fails it. `ignore` (the default on a `warn` gate): the decision is not compared.
- A neutral decision (`NEUTRAL_DECISION`) or an absent one (`ABSENT_DECISION`) never fails a gate: the score decides.
- If its own conditions skipped every agent in a stage, the stage is SKIPPED and its gate is not evaluated.

**The run verdict.** `all_gates_passed` is false when a stage ended FAILED, a stage ended ERRORED behind a blocking gate, a blocking gate accepted a conditional decision, or the run was stopped before every stage finished; otherwise it is true. That value, and nothing else, decides the run outcome and is what you save.
The run decision is `PASS` when `all_gates_passed` is true and no stage ended WARNED or ERRORED behind `warn`, `WARN` when it is true and one did, and `FAIL` when it is false.

**Warnings.** Report each warning code named above (with its stage or agent) in your final report and in the saved `raw_markdown`.

## Stages

**Agent launch protocol:** Launch each stage agent via the Agent tool with `subagent_type` set to the agent ref, and begin the prompt with the explicit tag `[agent:<agent-ref>]` (lowercase kebab-case). The agent-metrics hook resolves agent names only from this tag — omitting it captures the agent's metrics nameless.

### Stage 1: Categorical Mapping

- **ID:** `explore`

**Agents:**
- `aristotle-explorer`

**Gate:**
- Decision: ignore (default for a warn gate)
- On failure: warn (not blocking)

### Stage 2: Four-Cause Decomposition

- **ID:** `analyze`
- **Depends on:** `explore`

**Agents:**
- `aristotle-analyst`

**Gate:**
- Threshold: 70
- Decision: ignore (default for a warn gate)
- On failure: warn (not blocking)

### Stage 3: Teleological Alignment

- **ID:** `validate`
- **Depends on:** `analyze`

**Agents:**
- `aristotle-validator`

**Gate:**
- Threshold: 70
- Decision: ignore (default for a warn gate)
- On failure: warn (not blocking)

### Stage 4: Actualization Projection

- **ID:** `forecast`
- **Depends on:** `validate`

**Agents:**
- `aristotle-forecaster`

**Gate:**
- Threshold: 70
- Decision: ignore (default for a warn gate)
- On failure: warn (not blocking)

### Stage 5: Cross-Phase Synthesis

- **ID:** `synthesis`
- **Depends on:** `forecast`

**Agents:**
- `workflow-synthesis`

**Gate:**
- Threshold: 0
- Decision: ignore (default for a warn gate)
- On failure: warn (not blocking)

## Postflight

### Tracker Persistence

After all stages complete, save results to the tracker using `save_run`:

- **definition_type:** `pipeline`
- **definition_name:** `aristotle-pipeline`
- **definition_version:** `1.0.3`
- **workflow_type:** `cognitive-lens`
- **project:** `$ARGUMENTS` (the target project name)
- **agents:** Collect each agent result with name, score, decision (its saved form, Execution Rules), and summary. Splice the `-f tracker` output verbatim for the metrics fields (tokens, model, harness, duration_ms, agent_id) — do not hand-restructure or copy a subset
- **recommendations:** Collect ALL issues from ALL stages into a single recommendations array with agent, title, priority, severity, failure_code, file_path, line_number, description, and type
- **summary:** `{ all_gates_passed: <false if any stage ended FAILED, any stage ended ERRORED behind a blocking gate, a blocking gate accepted a conditional decision, or the run was stopped early; otherwise true (Execution Rules)>, average_score: <mean of all agent scores> }`
- **raw_markdown:** begin with a `params:` line listing every resolved run parameter as `name=value`, so an override is visible on the saved run; then the run decision (`PASS`, `WARN` or `FAIL`) and every warning reported, `STAGE_ERRORED` included

This MUST be a single bulk call — do NOT create individual issues. The `save_run` tool auto-increments the run number and detects regressions from prior runs.

**Token Metrics:**

Get token metrics from the agent-metrics buffer before saving:
```bash
agent-metrics buffer list --since 15m -f tracker
```

Splice each entry of the `-f tracker` output verbatim into `agents[]` — every field, including `duration_ms` and `agent_id` (the provenance join key to the buffer entry and transcript). Do not hand-restructure: `input_tokens`, `output_tokens`, `cache_creation_tokens`, `cache_read_tokens`, `cached_input_tokens`, `reasoning_output_tokens`, `thinking_tokens`, `tool_tokens`, `total_effective_tokens`, `harness`, `model`, `duration_ms`, and `agent_id` all carry through as-is.

**Field Mappings:**

| Source | Tracker Field | Notes |
|--------|---------------|-------|
| `stage.gate.score` | `agents[].score` | Total score |
| `stage.gate.decision` | `agents[].decision` | Agent decision, in its saved form (Execution Rules): the stage's reported verdict, never the gate's `Decision:` mode |
| `agent-metrics` | `agents[].model` | Model identifier |
| `stage.output.issues` | `recommendations[]` | Flatten nested structure |

**Verification:** After saving, compare `json.summary.total_issues` with the saved count. Alert if mismatch.

### On Success

Run these when `all_gates_passed` is true.

- **ACTUALIZED — Full Aristotelian analysis complete.**

### On Failure

Run these when `all_gates_passed` is false.

- **POTENTIAL — Significant ontological gaps remain.**

## Source

**Schema:** https://uluops.ai/schemas/pdl/v1.6.0/pipeline.json
**Definition:** https://api.uluops.ai/api/v1/registry/definitions/pipeline/aristotle-pipeline@1.0.3
**Runtime:** https://api.uluops.ai/api/v1/registry/definitions/pipeline/aristotle-pipeline@1.0.3/render

---
*Generated from PDL v1.6.0 | Pipeline: aristotle-pipeline v1.0.3*
