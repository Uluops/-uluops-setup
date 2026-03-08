---
name: prompt-audit
description: Comprehensive audit of agent definitions, commands, or workflows. Uses prompt-pattern-analyzer for ecosystem context, prompt-engineer for validation, and prompt-quality-validator for best practices analysis. Use when reviewing existing prompts or before significant changes.
tools: Read, Grep, Glob, Bash
model: sonnet
---

# Prompt Audit

Comprehensive audit of agent definitions, commands, or workflows. Uses prompt-pattern-analyzer for ecosystem context, prompt-engineer for validation, and prompt-quality-validator for best practices analysis. Use when reviewing existing prompts or before significant changes.


**Philosophy**: Context-aware auditing. Understand ecosystem conventions first, then validate and improve with that context.
### Prompt Audit vs prompt-validate

| Aspect | Prompt Audit | prompt-validate |
|--------|------|------|
| Focus | Full audit with ecosystem context | Quick validation only |
| Duration | 6-15 minutes | 2-5 minutes |
| Agents Used | pattern-analyzer + prompt-engineer + prompt-quality | prompt-engineer only |
| Output | Features list + conditional refactored draft | Pass/fail with suggestions |

---

## Workflow Overview

```
┌──────────────────┐
│ pattern-analyzer  │ ◄── Ecosystem context
└────────┬─────────┘
         │
┌────────▼─────────┐
│ prompt-engineer   │ ◄── Validate with context (gate)
│ + type-specific   │     Includes inline structural checks
│   checks          │     based on artifact type
└────────┬─────────┘
         │
┌────────▼─────────┐
│ prompt-quality    │ ◄── Best practices review
│   validator       │
└────────┬─────────┘
         │
═════════▼══════════
 PERSIST TO TRACKER
 + Conditional draft
 (if score < 75)
════════════════════

```

Phase 0 establishes ecosystem conventions that inform all subsequent phases
Type-specific structural checks are performed inline by the orchestrator between prompt-engineer and prompt-quality phases
Refactored draft is a conditional output artifact generated only if prompt-engineer score < 75

Duration: 6-15 minutes (includes ecosystem analysis)
### Token Estimation

| Scope | Input Tokens | Output Tokens |
|-------|-------------|---------------|
| Single agent prompt | ~35,000 | ~4,000 |
| Workflow command | ~45,000 | ~6,000 |
| Large workflow (500+ lines) | ~60,000 | ~8,000 |
**Cost Drivers**:
- Ecosystem size: more agents = more pattern analysis tokens
- Prompt length: longer prompts = more validation tokens
- Issue count: more findings = more detailed output
Prompt audit is always sequential—each phase depends on prior context.
Phase 0 ecosystem context informs Phase 1 scoring benchmarks.
Phase 2 type checks depend on Phase 1 results.

---

## Agent Handoff Formats

Each agent passes structured data to the next in the pipeline:

| From | To | Passes | Expects |
|------|-----|--------|---------|
| Pattern Analyzer | Prompt Engineer | Ecosystem conventions, threshold benchmarks, decision pair standards, expected sections | Context-aware validation scoring using ecosystem baselines |
| Prompt Engineer | Prompt Quality Validator | Score, category breakdown, identified issues, structural compliance results | Best practice improvements with specific rewrite suggestions |

**Handoff Contract:**
- Pattern Analyzer provides context that informs all subsequent scoring
- Each phase builds on prior findings rather than re-checking
- Critical failures from Prompt Engineer block the pipeline
- All findings feed into tracker persistence regardless of outcome

---

## Pre-Flight: Target Detection and Configuration

Before running agents, determine the target path and which optional validators should run.

### Context Detection

**Detection criteria**: A detector returns TRUE if its command exits with code 0.

| Detector ID | Description |
|-------------|-------------|
| `is_agent_definition` | Run command: echo "{{ file }}" | grep -qE "agents/.*-agent\.md$" |
| `is_agent_command` | Run command: echo "{{ file }}" | grep -qE "commands/agents/" |
| `is_workflow_command` | Run command: echo "{{ file }}" | grep -qE "commands/workflows/" |
| `is_general_command` | Run command: echo "{{ file }}" | grep -qE "commands/" | grep -vE "commands/(agents|workflows)/" |

**is_agent_definition**:
```bash
echo "{{ file }}" | grep -qE "agents/.*-agent\.md$" && echo "DETECTED" || echo "NOT DETECTED"
```

**is_agent_command**:
```bash
echo "{{ file }}" | grep -qE "commands/agents/" && echo "DETECTED" || echo "NOT DETECTED"
```

**is_workflow_command**:
```bash
echo "{{ file }}" | grep -qE "commands/workflows/" && echo "DETECTED" || echo "NOT DETECTED"
```

**is_general_command**:
```bash
echo "{{ file }}" | grep -qE "commands/" | grep -vE "commands/(agents|workflows)/" && echo "DETECTED" || echo "NOT DETECTED"
```

### Metadata Extraction

Before running phases, extract the following metadata from the target:

| Step | Type | Description |
|------|------|-------------|
| `frontmatter_metadata` | frontmatter | Extract name, description, model, and tools from target file frontmatter |
| `section_count` | command | Count ## headings in the target file |
| `file_size` | command | Count lines in the target file |

**frontmatter_metadata**: Extract name, description, model, tools from `{{ file }}`
**section_count**:
```bash
grep -c '^## ' {{ file }}
```

**file_size**:
```bash
wc -l < {{ file }}
```


---

## Arguments

### Positional Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| file | Yes | Path to the prompt artifact to audit (agent, command, or workflow file) |


### Usage Examples

| Command | Behavior |
|---------|----------|
| `/workflows:prompt-audit agents/security-analyst-agent.md` | Audits agent definition with ecosystem context |
| `/workflows:prompt-audit commands/agents/validate.md` | Audits agent invocation command |
| `/workflows:prompt-audit commands/workflows/ship.md` | Audits workflow command |

---

## Execution Mode Selection


| Mode | Description | Best For |
|------|-------------|----------|
| Sequential | - | - |
| Parallel | - | - |


Prompt audit is always sequential—each phase depends on prior context.
Phase 0 ecosystem context informs Phase 1 scoring benchmarks.
Phase 2 type checks depend on Phase 1 results.

---

## Execution

Run each agent in sequence (or parallel groups if selected). Stop and fix if any agent fails. **Collect all recommendations for tracker persistence.**

### Phase 1: Ecosystem Pattern Analysis
**Commands**: pattern-analyzer@1.0.0

**Invoke via Task tool:**
```
Task(
  subagent_type: "pattern-analyzer",
  prompt: "[validator:pattern-analyzer] Validate {TARGET_DIRECTORY}. Return structured JSON OUTPUT.",
  description: "Pattern Analyzer"
)
```

**Gate**: threshold >= 50, on fail: warn

**Focus**:
- Discover all prompt artifacts (agents, commands, workflows)
- Extract scoring patterns and point allocations
- Identify decision vocabulary conventions
- Analyze threshold standards by agent type
- Detect structural patterns and inconsistencies

**Capture for tracker**: Ecosystem context (conventions, thresholds, patterns) for downstream phases.

**If failing**: Ecosystem data is limited (<5 agents). Proceed with generic conventions.

**Decision criteria**:
- INSIGHTFUL (✅): Score ≥75 AND ≥50% ecosystem coverage
- INCOMPLETE (⚠️): Score <75 OR <5 agents in ecosystem

**Alternatives**:
- `strategy-analyst@1.0.0` — Must override model to sonnet — default is opus. Use when deeper strategic analysis is needed.

**Key Outputs**:

| Output | Downstream Usage |
|--------|-----------------|
| threshold_convention | Benchmark for Phase 1 scoring — e.g., expected >=75 for validators |
| decision_pair_convention | Consistency check in Phase 1 — e.g., PASS/FAIL, DEPLOY/REVISE pairs |
| expected_sections | Type-specific validation — e.g., Mission, Output Format, Decision for agents |
| common_failure_modes | Focus areas for Phase 2 improvement suggestions |

---

### Phase 2: Prompt Engineer Validation
**Commands**: prompt-validate@1.0.0

**Invoke via Task tool:**
```
Task(
  subagent_type: "prompt-validate",
  prompt: "[validator:prompt-validate] Validate {TARGET_DIRECTORY}. Return structured JSON OUTPUT.",
  description: "Prompt Validator"
)
```

**Gate**: threshold >= 75, on fail: stop

**Why this threshold?** Prompts below 75 produce inconsistent agent behavior. The threshold ensures minimum deployment quality.

**Focus**:
- Clarity & Specificity (25 pts)
- Structure & Organization (20 pts)
- Completeness (25 pts)
- Effectiveness (20 pts)
- Consistency (10 pts)
- Type-specific structural compliance (inline checks per artifact type)

**Capture for tracker**: Overall score, category breakdown, vague language instances with line numbers, missing sections, improvement suggestions, and type-specific structural compliance.

**If failing**: Apply critical fixes from the improvement suggestions. Prompt does not meet deployment quality.

**Decision criteria**:
- DEPLOY (✅): Score ≥75 AND no critical issues AND structural checks pass
- REVISE (❌): Score <75 OR critical issues present OR structural elements missing

### For Agent Definitions

**Runs when**: `is_agent_definition`

Check for required elements:

| Check | What to Look For | Report |
|-------|------------------|--------|
| Required sections | "Mission", "Output Format", "Decision" | [OK]/[X] for each |
| Scoring framework | Contains "points", "pts", or "/100" | Show first 5 matches |
| Auto-fail conditions | Contains "auto.*fail", "critical.*issue", "must.*fix" | List if found |
| Quality gate | Contains checklist or gate criteria | List if found |
| Edge case handling | Has subsections (### headings) | Count found |

### For Agent Commands

**Runs when**: `is_agent_command`

Check for required elements:

| Check | What to Look For | Report |
|-------|------------------|--------|
| Agent reference | Contains "agents:" or "agent-" | [OK]/[X] |
| Argument handling | Contains "ARGUMENTS", "<directory>", "<path>" | [OK]/[X] |
| Threshold mention | Contains ">=[0-9]+", "Threshold", or "Score" | [OK]/[X] |

### For Workflows

**Runs when**: `is_workflow_command`

Check for required elements:

| Check | What to Look For | Report |
|-------|------------------|--------|
| Phase structure | Contains "### Phase" or "Phase [0-9]" | List phases found |
| Agent invocations | Contains "/agents:" or "agent" references | List agents used |
| Decision gates | Contains "PASS", "FAIL", "STOP", "Continue", "proceed" | [OK]/[X] |
| Summary format | Contains "Summary", "Report", or "Result" | [OK]/[X] |

**Depends on**: pattern-analyzer

---

### Phase 3: Prompt Quality Best Practices
**Commands**: prompt-quality@1.0.0

**Invoke via Task tool:**
```
Task(
  subagent_type: "prompt-quality",
  prompt: "[validator:prompt-quality] Validate {TARGET_DIRECTORY}. Return structured JSON OUTPUT.",
  description: "Prompt Quality Validator"
)
```

**Gate**: threshold >= 70, on fail: warn

**Focus**:
- Clarity: Vague language → specific alternatives
- Structure: Missing sections → template additions
- Completeness: Missing edge cases → defined behaviors
- Effectiveness: Subjective criteria → objective measures

**Capture for tracker**: Best practices analysis with specific rewrite suggestions.

**If failing**: Review improvement suggestions. Prompt is functional but could be more effective.

**Decision criteria**:
- STRONG (✅): Score ≥75 AND no high-priority findings
- ADEQUATE (⚠️): Score 60-74
- WEAK (❌): Score <60

**Depends on**: prompt-engineer

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
| pattern-analyzer | 15% |
| prompt-engineer | 55% |
| prompt-quality | 30% |


## Output: Consolidated Report

```
+=============================================================================+
|                          PROMPT AUDIT REPORT                                |
+=============================================================================+

File: $ARGUMENTS
Type: {agent | command | workflow}
Name: {extracted name}

==============================================================================

PHASE 0: ECOSYSTEM PATTERN ANALYSIS

Ecosystem Inventory:
- Agents: [N]
- Commands: [N]
- Workflows: [N]

Ecosystem Conventions:
- Threshold standard: >=[X] ([N]% of agents)
- Decision pair: [KEYWORD_A]/[KEYWORD_B]
- Required sections: [list]
- Point distribution: [pattern]

Consistency Check:
{If target diverges from conventions:}
- Target uses [X] but ecosystem standard is [Y]
- Consider aligning for consistency

{If target follows conventions:}
- [OK] Target aligns with ecosystem conventions

Status: [OK INSIGHTFUL | WARNING INCOMPLETE]

-------------------------------------------------------------------------------

PHASE 1: PROMPT ENGINEER VALIDATION

Score: [X]/100

Clarity & Specificity:  [X]/25
Structure:              [X]/20
Completeness:           [X]/25
Effectiveness:          [X]/20
Consistency:            [X]/10

Status: [DEPLOY | REVISE]

-------------------------------------------------------------------------------

PHASE 2: TYPE-SPECIFIC CHECKS

Type: {artifact_type}

Required Elements:
[OK] {present element}
[OK] {present element}
[X] {missing element}

Convention Compliance:
| Element | Found | Expected | Status |
|---------|-------|----------|--------|
| Decision keywords | X | Y | OK/X |
| Threshold format | X | Y | OK/X |
| Scoring format | X | Y | OK/X |

-------------------------------------------------------------------------------

PHASE 3: IMPROVEMENT ANALYSIS

CRITICAL (Must Fix):
1. [Issue]: Line [N]
   Problem: {why it matters}
   Fix: {specific rewrite}

RECOMMENDED (Should Fix):
1. [Issue]: Line [N]
   Problem: {impact}
   Fix: {suggestion}

SUGGESTIONS (Consider):
1. [Enhancement]: {description}

-------------------------------------------------------------------------------

IMPROVEMENT EXAMPLES

### Example 1: {issue type}

**Location:** Line [N]

**Current:**
{current text}

**Improved:**
{better text}

**Why better:** {explanation}

-------------------------------------------------------------------------------

PHASE 4: REFACTORED DRAFT

{If score < 75, include full refactored prompt}
{If score >= 75, show "Not required - prompt passes validation"}

===============================================================================

AUDIT DECISION

[APPROVED - Ready for use]
  No changes required. Prompt meets project standards.

OR

[IMPROVEMENTS AVAILABLE - Optional enhancements]
  Prompt is functional but could be improved.
  See SUGGESTIONS section above.

OR

[REVISION REQUIRED - Must fix before deployment]
  Critical issues found. See CRITICAL section.
  Refactored draft provided in Phase 4.

===============================================================================

NEXT STEPS

{If APPROVED}
- No action required
- Consider suggestions for future iterations

{If IMPROVEMENTS AVAILABLE}
- Review suggestions
- Apply changes that add value
- Re-run audit to verify (optional)

{If REVISION REQUIRED}
1. Apply critical fixes from Phase 3
2. OR use refactored draft from Phase 4
3. Re-run: /workflows:prompt-audit $ARGUMENTS
4. Iterate until APPROVED

+=============================================================================+

```

### Decision Criteria

| Score | Issues | Decision |
|-------|--------|----------|
| >=85 | None critical | [OK] APPROVED |
| 75-84 | None critical | [FIX] IMPROVEMENTS AVAILABLE |
| <75 OR critical issues | Any | [LOOP] REVISION REQUIRED |

**[LOOP] REVISION REQUIRED Auto-Triggers:**
- Undefined or vague mission statement
- No output format specification
- Conflicting instructions
- Missing scoring/threshold for validation agents
- Decision criteria are purely subjective


---

## Final Phase: Outputs (MANDATORY)

**This phase runs regardless of pass/fail status.** All agent recommendations must be captured.

### Artifacts

**features-list** (markdown):
Consolidated recommendations from all phases with scoring breakdown, category analysis, and actionable improvement items for tracker persistence.

Generate a timestamp for the filename:

```bash
TIMESTAMP=$(date +%Y-%m-%dT%H-%M-%S)
echo "Timestamp: $TIMESTAMP"
```

Write file to: `docs/{{ features_file }}`

**Content template:**

# Prompt Audit: {{ file_name }}

**Date**: {{ timestamp }}
**Target**: {{ file_path }}
**Type**: {{ artifact_type }}

## Scores

| Phase | Score | Status |
|-------|-------|--------|
| Pattern Analyzer | {score}/100 | {PASS/WARN} |
| Prompt Engineer | {score}/100 | {PASS/FAIL} |
| Prompt Quality | {score}/100 | {PASS/WARN} |
| **Weighted Average** | **{score}/100** | |

## Recommendations

### Critical (fix before deployment)
- [ ] {recommendation with file:line reference}

### Suggested (review before deployment)
- [ ] {recommendation with file:line reference}

### Backlog (post-deployment)
- [ ] {recommendation}


**refactored-draft** (markdown):
A refactored version of the target prompt with all critical fixes applied from Phases 0-2. Generated only when prompt-engineer score is below deployment threshold.
**Condition**: Generated only when `phases.prompt-engineer.score < 75`

Generate a timestamp for the filename:

```bash
TIMESTAMP=$(date +%Y-%m-%dT%H-%M-%S)
echo "Timestamp: $TIMESTAMP"
```

Write file to: `docs/{{ file_name }}-refactored.md`

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
  project: claude-agent-workflows,
  workflow_type: "prompt-audit",
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

**Query validation-tracker and compare to tracker_payload_length**

- On mismatch: **warn** (do NOT block or re-attempt)
- Saved count differs from payload - some recommendations may not have persisted.

**Verification procedure:**

1. Query the tracker for the saved run
2. Compare saved recommendation count against your payload count
3. If counts differ, log the discrepancy as a note — cross-phase deduplication is expected when multiple validators flag the same issue
4. **Proceed regardless** — the save already succeeded


---





---

## Iteration Pattern

```
Existing Prompt
     │
     ▼
/workflows:prompt-audit
     │
     ├── APPROVED ──────▶ Done (optional improvements noted)
     │
     ├── IMPROVEMENTS ──▶ Apply suggestions ──▶ (optional re-audit)
     │
     └── REVISION ──────▶ Apply fixes OR use refactored draft
                              │
                              └──▶ /workflows:prompt-audit (repeat)

```

**Typical iterations**:
- Well-written prompt: 1 run (APPROVED or IMPROVEMENTS)
- Prompt with issues: 2-3 runs
- Legacy or undocumented prompt: 2-4 runs

**Report behavior across iterations**:
- Each run creates a features list documenting current state and recommendations
- Previous runs are preserved for audit trail
- Resolved items from previous runs will not appear if agents no longer flag them
- Tracker detects regressions when previously fixed issues reappear

---

## Quick Reference

| Agent | Threshold | Group |
|-------|-----------|-------|
| Ecosystem Pattern Analysis | threshold >= 50, on fail: warn | 1 |
| Prompt Engineer Validation | threshold >= 75, on fail: stop | 2 |
| Prompt Quality Best Practices | threshold >= 70, on fail: warn | 3 |


---

## Troubleshooting

### Phase 3 suggestions conflict with each other

The prompt-quality-validator generates suggestions independently. If suggestions conflict:
1. Prioritize CRITICAL over RECOMMENDED over SUGGESTIONS
2. When two suggestions target the same section, choose the more specific one
3. Use your judgment on which improves clarity most


### Refactored draft is too different from original

The refactored draft prioritizes correctness over minimal changes. If you prefer incremental updates:
1. Apply only the CRITICAL fixes manually
2. Re-audit to verify those fixes
3. Then consider RECOMMENDED items one by one


### Type detection is wrong

Override by specifying in your prompt:
"Treat this as an agent definition and audit accordingly."
/workflows:prompt-audit agents/my-prompt.md


### Score seems too low for a working prompt

The audit is strict because prompts compound errors. A 65-score prompt may work but produces inconsistent results. The refactored draft shows what a higher-scoring version looks like.


### Pattern analyzer shows INCOMPLETE

This happens when the ecosystem has fewer than 5 agents. The audit proceeds with generic conventions instead of project-specific patterns. Results are still valid but less context-aware.


