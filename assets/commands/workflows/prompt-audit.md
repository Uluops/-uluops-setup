---
name: prompt-audit
description: Comprehensive prompt audit with ecosystem context. Pattern analyzer provides ecosystem baseline, prompt engineer validates structure and scoring, prompt quality validates clarity and effectiveness. Sequential with gating.
tools: Read, Grep, Glob, Bash
model: opus
---

# Prompt Audit

> Comprehensive prompt audit with ecosystem context. Pattern analyzer provides ecosystem baseline, prompt engineer validates structure and scoring, prompt quality validates clarity and effectiveness. Sequential with gating.

Duration: 6-15 minutes
**Arguments**: `file` (required)
## Pre-Flight Detection

- **is_agent_definition**: `grep -rqE --include='{{ file }}'  '^(name|description|type):' . 2>/dev/null`
- **is_agent_command**: `grep -rqE --include='{{ file }}'  'subagent_type|\[validator:' . 2>/dev/null`
## Execution

```
Group 1 (sequential): pattern-analyzer
Group 2 (sequential): prompt-engineer
Group 3 (sequential): prompt-quality
```
## Phases

| # | Agent | Threshold | Gate | Condition |
|---|-------|-----------|------|-----------|
| 1 | pattern-analyzer@latest | threshold >= 50, on fail: warn | stop | — |
| 2 | prompt-validate@latest | threshold >= 75, on fail: stop | stop | — |
| 3 | prompt-quality@latest | threshold >= 70, on fail: warn | stop | — |

**Ecosystem Pattern Analysis**: Ecosystem scoring patterns and conventions; Decision vocabulary and threshold standards
**Prompt Engineering Validation** (after pattern-analyzer): Clarity, structure, and completeness; Scoring framework and effectiveness
**Prompt Quality Validation** (after prompt-engineer): Clarity and specificity; Objective effectiveness criteria
## Scoring

**Method**: weighted_average
 — pattern-analyzer: 15%, prompt-engineer: 55%, prompt-quality: 30%
## Results Submission

Write markdown report to: `{{ target_path }}/{{ report_file }}`
Save ALL findings to tracker via `mcp_uluops-tracker_save_run` with project=`{{ target_name }}`, workflow_type=`prompt-audit`, definition_type=`workflow`, definition_name=`prompt-audit`, definition_version=`2.0.1`. Include validators array (name, score, status, model) and recommendations array (validator, title, priority, severity, description, file_path, line_number). Each file:line reference becomes a separate recommendation. Priority: blocking=critical, warnings=suggested, post-ship=backlog.
After saving, query tracker and compare counts. Mismatches from cross-phase deduplication are expected — warn only, do not re-attempt.
