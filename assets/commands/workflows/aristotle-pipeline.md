---
name: aristotle-pipeline
description: Sequential four-phase Aristotelian analysis pipeline. Explorer maps the categorical landscape, Analyst decomposes four causes, Validator checks teleological alignment, Forecaster projects actualization trajectory. Each phase builds on the previous for progressively deeper ontological understanding.
tools: Read, Grep, Glob, Bash
model: opus
---

# Aristotle Pipeline

Sequential four-phase Aristotelian analysis pipeline. Explorer maps the categorical landscape, Analyst decomposes four causes, Validator checks teleological alignment, Forecaster projects actualization trajectory. Each phase builds on the previous for progressively deeper ontological understanding.


**Philosophy**: Understanding requires progressive deepening — discover WHAT kinds exist (Explorer), WHY through four causes (Analyst), WHETHER means serve ends (Validator), WHERE the trajectory leads (Forecaster). Each phase builds on its predecessor.

---

## Workflow Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                   ARISTOTLE PIPELINE                            │
│       Explorer → Analyst → Validator → Forecaster               │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Phase 1: Categorical Mapping [OPUS]                            │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  aristotle-explorer                                      │   │
│  │  Genus/differentia, taxonomic inventory, kind-mapping    │   │
│  │  ESSENTIAL / CATEGORIZED / UNCATEGORIZED                 │   │
│  └─────────────────────────┬────────────────────────────────┘   │
│                            │ taxonomic map                      │
│                            ▼                                    │
│  Phase 2: Four-Cause Decomposition [OPUS]                      │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  aristotle-analyst                                       │   │
│  │  Material, formal, efficient, final cause + telos        │   │
│  │  TELEOLOGICAL / ATELEOLOGICAL                            │   │
│  └─────────────────────────┬────────────────────────────────┘   │
│                            │ four-cause decomposition           │
│                            ▼                                    │
│  Phase 3: Teleological Validation [OPUS]                       │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  aristotle-validator                                     │   │
│  │  Alignment audit, means-to-ends, category errors         │   │
│  │  ALIGNED / MISALIGNED                                    │   │
│  └─────────────────────────┬────────────────────────────────┘   │
│                            │ alignment audit                    │
│                            ▼                                    │
│  Phase 4: Actualization Forecasting [OPUS]                     │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  aristotle-forecaster                                    │   │
│  │  Potentiality→actuality, impediments, trajectory         │   │
│  │  HIGH_CONFIDENCE / MODERATE_CONFIDENCE / LOW_CONFIDENCE  │   │
│  └─────────────────────────┬────────────────────────────────┘   │
│                            │                                    │
│                            ▼                                    │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Save to Tracker (cognitive-lens)                        │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘

```

[OPUS] = All phases run on Opus for deep philosophical reasoning
[SEQUENTIAL] = Each phase depends on the previous
[PIPELINE] = Discovery → Analysis → Validation → Forecasting

Duration: 15-30 minutes (4 Opus agents in sequence)
Each phase inherits context from its predecessor
Explorer establishes the categorical vocabulary that later phases use
Analyst builds on Explorer's categories to identify causes and telos
Validator checks whether Analyst's telos assessment holds under scrutiny
Forecaster projects forward from the validated categorical-teleological picture

---

## Agent Handoff Formats

Each agent passes structured data to the next in the pipeline:

| From | To | Passes | Expects |
|------|-----|--------|---------|
| Aristotle Explorer | Aristotle Analyst | Taxonomic map, categorical inventory, genus/differentia classifications, essential definitions | Use categorical vocabulary to ground four-cause decomposition — identify causes for the categories discovered |
| Aristotle Analyst | Aristotle Validator | Four-cause decomposition, telos assessment, essential/accidental property distinctions | Validate whether the identified telos is coherent and means are properly ordered toward it |
| Aristotle Validator | Aristotle Forecaster | Alignment audit, validated categories, confirmed or disputed telos, category error inventory | Project actualization trajectory from the validated teleological picture — what impediments remain? |

**Handoff Contract:**
- Each phase builds on its predecessor — this is NOT parallel analysis
- Explorer establishes categorical vocabulary used by all subsequent phases
- Analyst decomposes causes using Explorer's categories as raw material
- Validator checks Analyst's telos assessment against Explorer's categorical landscape
- Forecaster projects from Validator's confirmed picture, noting where disputed elements create uncertainty
- If an early phase scores low, later phases should note the weaker foundation

---


---

## Arguments

### Positional Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| target | Yes | Target directory, file, or artifact to analyze |


### Usage Examples

| Command | Behavior |
|---------|----------|
| `/workflows:aristotle-pipeline uluops-registry-api/` | Full four-phase Aristotelian analysis of the registry API codebase |
| `/workflows:aristotle-pipeline udl/adl/v3/code-validator.agent.yaml` | Progressive ontological deepening on an agent definition |
| `/workflows:aristotle-pipeline docs/specs/cognitive-lens-library-spec.md` | Categorical mapping through actualization forecasting of a specification |

---

## Execution Mode Selection


| Mode | Description | Best For |
|------|-------------|----------|
| Sequential | Each phase builds on the previous phase's output | Always — progressive deepening requires ordered execution |

**Parallel execution groups (when parallel mode selected):**

```
Group 1 (sequential):     explore
                           │
                           ▼
Group 2 (sequential):     analyze
                           │
                           ▼
Group 3 (sequential):     validate
                           │
                           ▼
Group 4 (sequential):     forecast
                           │
                           ▼
Group 5 (always):     persist
```

**Note:** Conditional validators only run in their groups if detected in pre-flight.

Each phase inherits context from its predecessor
Explorer establishes the categorical vocabulary that later phases use
Analyst builds on Explorer's categories to identify causes and telos
Validator checks whether Analyst's telos assessment holds under scrutiny
Forecaster projects forward from the validated categorical-teleological picture

---

## Execution

Run each agent in sequence (or parallel groups if selected). Stop and fix if any agent fails. **Collect all recommendations for tracker persistence.**

### Phase 1: Categorical Mapping
**Commands**: aristotle-explorer@1.0.0

**Invoke via Task tool:**
```
Task(
  subagent_type: "aristotle-explorer",
  prompt: "[validator:aristotle-explorer] Validate {TARGET_DIRECTORY}. Return structured JSON OUTPUT.",
  description: "Aristotle Explorer"
)
```

**Gate**: threshold >= 70, on fail: warn

**Why this threshold?** Categorical mapping requires identifying meaningful kinds. Score >=70 indicates the taxonomic landscape is sufficiently mapped for downstream analysis.

**Focus**:
- What KIND of thing is each element? (genus/differentia)
- Categorical inventory of the artifact's domain
- Necessary vs accidental properties of each category
- Taxonomic relationships between categories
- Essential definitions grounding the analysis

**Capture for tracker**: Taxonomic map, categorical inventory, genus/differentia classifications, essential definitions.

**If failing**: Document categorical gaps. This is advisory — pipeline continues to capture all perspectives.

**Decision criteria**:
- ESSENTIAL: Score >=70 AND categories clearly identified with genus/differentia
- CATEGORIZED: Score >=50 AND some categories identified but incomplete
- UNCATEGORIZED: Score <50 OR categories unclear

---

### Phase 2: Four-Cause Decomposition
**Commands**: aristotle-analyst@1.0.0

**Invoke via Task tool:**
```
Task(
  subagent_type: "aristotle-analyst",
  prompt: "[validator:aristotle-analyst] Validate {TARGET_DIRECTORY}. Return structured JSON OUTPUT.",
  description: "Aristotle Analyst"
)
```

**Gate**: threshold >= 70, on fail: warn

**Why this threshold?** Four-cause analysis requires identifying at least material, formal, and final cause. Score >=70 indicates meaningful causal decomposition.

**Focus**:
- Material cause (what is the artifact made of?)
- Formal cause (what structure does it have?)
- Efficient cause (what process produced it?)
- Final cause / telos (what is it FOR?)
- Essential vs accidental properties
- Telos coherence (are means ordered toward ends?)

**Capture for tracker**: Four-cause decomposition, telos assessment, essential/accidental distinctions.

**If failing**: Document causal gaps. The pipeline continues — later phases may still reveal valuable insights.

**Decision criteria**:
- TELEOLOGICAL: Score >=70 AND telos is coherent AND means ordered toward ends
- ATELEOLOGICAL: Score <70 OR telos incoherent OR means disconnected from ends

**Depends on**: explore

---

### Phase 3: Teleological Alignment Validation
**Commands**: aristotle-validator@1.0.0

**Invoke via Task tool:**
```
Task(
  subagent_type: "aristotle-validator",
  prompt: "[validator:aristotle-validator] Validate {TARGET_DIRECTORY}. Return structured JSON OUTPUT.",
  description: "Aristotle Validator"
)
```

**Gate**: threshold >= 70, on fail: warn

**Why this threshold?** Teleological validation requires checking alignment against identified telos. Score >=70 indicates the artifact's means serve its ends.

**Focus**:
- Teleological alignment (means properly ordered toward ends?)
- Category error detection (elements misclassified or misplaced?)
- Function fulfillment (does each component serve its natural function?)
- Means-to-ends ordering (are intermediate steps properly sequenced?)
- Alignment audit across the artifact's structure

**Capture for tracker**: Alignment audit, category error inventory, means-to-ends assessment, function fulfillment.

**If failing**: Document alignment concerns. Pipeline continues for complete Aristotelian picture.

**Decision criteria**:
- ALIGNED: Score >=70 AND means properly ordered AND no category errors
- MISALIGNED: Score <70 OR means disordered OR significant category errors

**Depends on**: analyze

---

### Phase 4: Actualization Trajectory Projection
**Commands**: aristotle-forecaster@1.0.0

**Invoke via Task tool:**
```
Task(
  subagent_type: "aristotle-forecaster",
  prompt: "[validator:aristotle-forecaster] Validate {TARGET_DIRECTORY}. Return structured JSON OUTPUT.",
  description: "Aristotle Forecaster"
)
```

**Gate**: threshold >= 70, on fail: warn

**Why this threshold?** Actualization forecasting requires a validated telos to project against. Score >=70 indicates a credible trajectory.

**Focus**:
- Potentiality-to-actuality trajectory mapping
- Impediments to telos realization
- Current actualization state assessment
- Natural developmental path projection
- Conditions required for full actualization

**Capture for tracker**: Actualization trajectory, impediment inventory, developmental path, realization conditions.

**If failing**: Document trajectory concerns. All four perspectives are captured regardless.

**Decision criteria**:
- HIGH_CONFIDENCE: Score >=75 AND clear trajectory with manageable impediments
- MODERATE_CONFIDENCE: Score >=55 AND trajectory visible but significant impediments
- LOW_CONFIDENCE: Score <55 OR trajectory unclear OR blocking impediments

**Depends on**: validate

---

### Phase 5: Save Results to Tracker
**Commands**: workflow-synthesis@1.0.0

**Invoke via Task tool:**
```
Task(
  subagent_type: "workflow-synthesis",
  prompt: "[validator:workflow-synthesis] Validate {TARGET_DIRECTORY}. Return structured JSON OUTPUT.",
  description: "Workflow Synthesis"
)
```

**Gate**: threshold >= 0, on fail: warn

**Why this threshold?** Synthesis and persistence always run regardless of phase scores.

**Focus**:
- Synthesize cross-phase insights from the sequential pipeline
- Persist all phase results to uluops-tracker
- Generate report artifact

**Capture for tracker**: Cross-phase synthesis and results persisted to cognitive-lens tracker.

**If failing**: Synthesis and tracker save always attempted.

---


---

## Summary Report

After all phases complete, summarize:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Target: [path]
Run: [N]

┌─────────────────────┬────────┬────────────┐
│ Agent               │ Score  │ Status     │
├─────────────────────┼────────┼────────────┤
│ ...                 │ [X]/100│ ✅/❌/⏭️   │
└─────────────────────┴────────┴────────────┘

```


### Scoring

**Method**: weighted_average

| Phase | Weight |
|-------|--------|
| explore | 15% |
| analyze | 35% |
| validate | 35% |
| forecast | 15% |


---

## Final Phase: Outputs (MANDATORY)

**This phase runs regardless of pass/fail status.** All agent recommendations must be captured.

### Artifacts

**aristotle-pipeline-report** (markdown):

Generate a timestamp for the filename:

```bash
TIMESTAMP=$(date +%Y-%m-%dT%H-%M-%S)
echo "Timestamp: $TIMESTAMP"
```

Write file to: `{{ target_path }}/{{ report_file }}`

#### Granularity Rules

**DO NOT consolidate multiple findings into single entries.** The tracker handles deduplication via fingerprinting. Save ALL raw findings:

| Agent Reports | You Save |
|---------------|----------|
| "N+1 pattern in 14 locations" | 14 separate recommendations, one per file:line |
| "Missing null checks on 8 .find() calls" | 8 separate recommendations |
| "6 endpoints missing from docs" | 6 separate recommendations |

**Rule:** If validator output has a file:line reference, it becomes a separate recommendation entry.

### Save to Tracker (MANDATORY — Always Save First)

**CRITICAL: Always save to the tracker. Never skip this step.**

After writing the markdown file, save results via `mcp__uluops-tracker__save_features_list`:

```
mcp__uluops-tracker__save_features_list({
  project: {{ target_name }},
  workflow_type: "cognitive-lens",
  timestamp: {ISO8601 timestamp},
  validators: [
    {
      "name": "{Agent Name}",
      "score": {numeric},
      "status": "{PASS|FAIL|SKIP}",
      "model": "{haiku|sonnet|opus}"
    }
    // ... one entry per agent
  ],
  recommendations: [
    {
      "validator": "{agent-name}",
      "title": "{short title}",
      "priority": "{critical|suggested|backlog}",
      "severity": "{critical|high|medium|low|info}",
      "description": "{details}",
      "file_path": "{path}",
      "line_number": {number}
    }
    // ... one entry per recommendation
  ]
})
```

**Priority mapping:**
- Blocking (fix before ship) → `"critical"`
- Warnings (review before ship) → `"suggested"`
- Post-ship/backlog items → `"backlog"`

### Post-Save Verification

After saving, verify the data was persisted correctly. **These are warnings, not blockers.**

**Query uluops-tracker and compare to recommendations.length**

- On mismatch: **warn** (do NOT block or re-attempt)
- Saved count differs from payload. Cross-phase deduplication is expected.

**Verification procedure:**

1. Query the tracker for the saved run
2. Compare saved recommendation count against your payload count
3. If counts differ, log the discrepancy as a note — cross-phase deduplication is expected when multiple validators flag the same issue
4. **Proceed regardless** — the save already succeeded


---


---

## Iteration Pattern

```
┌─────────────────────────────────────────────────────────────────────────┐
│                  ARISTOTLE PIPELINE ANALYSIS FLOW                       │
└─────────────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────┐
│  Run Pipeline   │  /workflows:aristotle-pipeline <target>
└────────┬────────┘
          │
          ▼
┌─────────────────┐     ┌─────────────────┐
│  Review Report  │────▶│  Address         │
│  + Trajectory   │     │  Findings        │
└────────┬────────┘     └────────┬────────┘
          │                       │
         Done                     │
                  ◀───────────────┘
                  (Re-run to track actualization progress)

```

**Typical iterations**:
- Initial ontological audit: 1 run
- After addressing category errors or alignment issues: 1-2 runs to measure teleological improvement
- Tracking actualization over time: Periodic runs to track trajectory changes

**Report behavior across iterations**:
- Each run creates a timestamped report file
- Previous reports are preserved for comparison
- Run periodically to track actualization trajectory changes
- Compare reports to measure ontological maturity over time

---

## Quick Reference

| Agent | Threshold | Group |
|-------|-----------|-------|
| Categorical Mapping | threshold >= 70, on fail: warn | 1 |
| Four-Cause Decomposition | threshold >= 70, on fail: warn | 2 |
| Teleological Alignment Validation | threshold >= 70, on fail: warn | 3 |
| Actualization Trajectory Projection | threshold >= 70, on fail: warn | 4 |
| Save Results to Tracker | threshold >= 0, on fail: warn | 5 |


---

## Troubleshooting

### Why run sequentially instead of in parallel like foundations?

The four Aristotle agents form a deepening pipeline, not independent lenses.
Explorer discovers categories that Analyst uses for decomposition.
Analyst identifies telos that Validator checks for alignment.
Validator confirms the picture that Forecaster projects forward from.
Running in parallel would mean each agent works without its predecessor's
insights — defeating the purpose of progressive deepening.


### An early phase scored low — should I trust later phases?

Later phases note when they're building on a weaker foundation.
A low Explorer score means the categorical vocabulary is incomplete —
Analyst may decompose causes for the wrong categories.
A low Analyst score means the telos may be misidentified —
Validator checks alignment against a potentially wrong target.
The pipeline continues regardless (on_failure: continue) because
even partial insights are valuable, but weight the findings accordingly.


### How is this different from running aristotle-analyst alone?

aristotle-analyst gives you four-cause decomposition as a standalone analysis.
The pipeline surrounds it with categorical discovery (Explorer), alignment
validation (Validator), and trajectory projection (Forecaster). You get
not just "what are the causes" but "what categories exist → what causes
them → are they aligned → where are they heading."


### Why Opus for all four phases?

Each phase requires deep philosophical reasoning — categorical classification,
causal decomposition, teleological validation, and actualization projection
are reasoning-heavy tasks where Opus produces substantially better results
than Sonnet. The sequential design means only one Opus agent runs at a time.
