---
name: pre-impl
description: Validates proposed design and architecture BEFORE implementation begins. Reviews design/plan against existing architecture patterns. Blocks implementation if design has critical flaws. Use when you have a design document, PRD, or implementation plan ready for review.
tools: Read, Grep, Glob, Bash
model: sonnet
---

# Pre-Implementation Review

Validate design and architecture before implementation begins.

**Philosophy**: "Measure twice, cut once." Time spent validating design is cheaper than time spent refactoring bad architecture.

---

## Workflow Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                    PRE-IMPL VALIDATION PIPELINE                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────┐    ┌────────────────────────────┐                │
│  │   Gather     │    │   Validation Phase         │                │
│  │   Context    │ ──▶│   (Sequential or Parallel) │                │
│  │              │    │                            │                │
│  └──────────────┘    │  ┌─────────────────────┐  │                │
│                      │  │ Architect Review    │  │                │
│                      │  │ (≥75)               │  │                │
│                      │  └─────────────────────┘  │                │
│                      │            +              │                │
│                      │  ┌─────────────────────┐  │                │
│                      │  │ Docs Validator      │  │                │
│                      │  │ (≥75, optional)     │  │                │
│                      │  └─────────────────────┘  │                │
│                      └────────────────────────────┘                │
│                                   │                                │
│                                   ▼                                │
│                      ┌────────────────────────────┐                │
│                      │   Summary + Save Tracker   │                │
│                      └────────────────────────────┘                │
│                                                                     │
│  Duration: 3-10 minutes (parallel: 3-6 min)                        │
│  Run: Before writing any code                                       │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Agent Handoff Formats

Pre-implementation passes structured context to downstream workflows:

| From | To | Passes | Purpose |
|------|-----|--------|---------|
| Pre-Impl | Implementation Phase | Design approval, scope bounds, risk assessment | Guides implementation within validated constraints |
| Pre-Impl | Post-Impl (later) | Design baseline, original requirements | Post-impl compares implementation against original design |
| Pre-Impl | Uluops Tracker | Score, gaps, recommendations | Historical tracking of design decisions |

**Validators in this workflow:**

| Phase | Validator | Threshold | Condition |
|-------|-----------|-----------|-----------|
| 2 | pre-implementation-architect | ≥75 | Always |
| 3 | docs-validator | ≥75 | If design docs exist |

**Handoff Contract:**
- Implementation receives: approved design scope (files, LOC, dependencies)
- Post-impl receives: design context for architectural drift detection
- Tracker receives: all critical gaps and suggestions for correlation across runs

**Key Data Passed Forward:**
```
design_approval:
  score: 82
  status: PROCEED
  scope_bounds:
    max_files: 10
    max_loc: 500
    max_dependencies: 3
  risk_assessment: LOW
  critical_gaps: []
  suggestions:
    - "Consider caching strategy for token validation"
    - "Document rate limiting approach"
```

---

## Agent Metrics

Metrics are auto-captured to the buffer. For tracker-ready format:

```bash
agent-metrics buffer list --since 5m -f tracker
```

The validator name is auto-detected from the buffer. Output includes all token fields:

```json
{
  "name": "pre-implementation-architect",
  "model": "claude-sonnet-4-5-20250929",
  "tokens": {
    "input_tokens": 42000,
    "output_tokens": 5800,
    "cache_creation_tokens": 28000,
    "cache_read_tokens": 14000,
    "total_effective_tokens": 47800
  },
  "duration_ms": 45000
}
```

**Use these metrics** when saving to the uluops tracker instead of estimates.

---

## Pre-Flight: Target Detection and Configuration

Before running validation, verify the target directory and gather context.

### Step 1: Parse Arguments

**Usage**: `/workflows:pre-impl <directory>`

**Examples**:
- `/workflows:pre-impl ./services/new-service`
- `/workflows:pre-impl ./packages/feature`
- `/workflows:pre-impl .`

**Target Directory**: $ARGUMENTS

1. **Extract target path**: Use the first argument as the target path. If no path provided, use the current working directory (`.`).
2. **Resolve absolute path**: Convert relative paths to absolute paths for consistent reporting.
3. **Extract target name**: Use the directory basename for status reporting (e.g., `new-service` from `./services/new-service`).

Report the configuration:
- "📋 Target: {absolute_path}"
- "📁 Project: {target_name}"

### Step 2: Verify Directory Existence

Check if the target directory exists:

```bash
if [ -d "$ARGUMENTS" ]; then echo "✅ Directory exists: $ARGUMENTS"; else echo "ℹ️  Directory does not exist yet (new project): $ARGUMENTS"; parent_dir=`dirname "$ARGUMENTS"`; if [ -d "$parent_dir" ]; then echo "✅ Parent directory exists: $parent_dir"; else echo "❌ Parent directory does not exist: $parent_dir"; echo "Create parent directory before running pre-implementation review"; exit 1; fi; fi
```

### Step 3: Display Target Structure (if exists)

If the directory exists, show its current state:

```bash
if [ -d "$ARGUMENTS" ]; then
  echo "📂 Current structure:"
  ls -la "$ARGUMENTS" 2>/dev/null | head -20
fi
```

### Step 4: Detect Design Documentation

Check for existing design documentation that docs-validator can validate:

```bash
echo ""
echo "📄 DESIGN DOCUMENTATION CHECK"
echo "=============================="

# Check for design-related files
DESIGN_DOCS=`find . -maxdepth 3 -type f \( -name "*design*" -o -name "*spec*" -o -name "*prd*" -o -name "*plan*" -o -name "README.md" \) -not -path "*/node_modules/*" 2>/dev/null | head -10`

if [ -n "$DESIGN_DOCS" ]; then
  echo "✅ Design documentation found:"
  echo "$DESIGN_DOCS"
  echo ""
  echo "✅ Docs Validator: ENABLED"
else
  echo "ℹ️  No design documentation found"
  echo "ℹ️  Docs Validator: SKIPPED (no docs to validate)"
fi
```

Report the detection result:
- **If design docs found**: "✅ Docs Validator: ENABLED"
- **If no docs found**: "ℹ️ Docs Validator: SKIPPED (no docs to validate)"

### Step 5: Execution Mode Selection

**After completing detection, ask the user to choose execution mode using AskUserQuestion:**

| Mode | Description | Best For |
|------|-------------|----------|
| Sequential | Run agents one at a time, stop on first failure | Debugging, first runs, when you want early feedback |
| Parallel | Run both agents concurrently | Speed, CI/CD, when design is well-documented |

**Parallel execution groups (when parallel mode selected AND docs detected):**

```
Group 1 (Parallel): pre-implementation-architect + docs-validator
                           │
                           ▼
Group 2 (Always):   Summary + Save to Tracker
```

**Note:** If docs-validator is skipped (no docs detected), only pre-implementation-architect runs regardless of mode selection.

**Important:** Even in parallel mode, if ANY agent fails with a blocking result, stop the pipeline and report all results collected so far.

**For parallel execution:** Use multiple Task tool calls in a single message:

```
// Example: Running both validators in parallel (when docs exist)
Task(subagent_type: "pre-implementation-architect", prompt: "[validator:pre-implementation-architect] ...", description: "Architecture review")
Task(subagent_type: "docs-validator", prompt: "[validator:docs-validator] ...", description: "Docs validation")
```

---

## Agent Invocation Method

**CRITICAL: Use the Task tool directly to invoke agents. Do NOT use the Skill tool.**

Each agent is invoked via the Task tool with the appropriate `subagent_type`:

```
Task(
  subagent_type: "{agent-name}",
  prompt: "[validator:{agent-name}] Validate {target-directory}. This is the pre-implementation pipeline.
           Return structured JSON OUTPUT for tracker integration.",
  description: "Run {agent-name}"
)
```

**Available subagent_types for this workflow:**

| Phase | subagent_type | Model | Condition |
|-------|---------------|-------|-----------|
| 2 | `pre-implementation-architect` | sonnet | Always |
| 3 | `docs-validator` | sonnet | If design docs detected |

---

## Execution

Run each agent in sequence (or parallel if selected). Stop and request design revisions if any agent fails with a blocking result. **Collect all recommendations for the features list.**

### Phase 1: Gather Context

**Purpose**: Understand what's being proposed before evaluating its architectural fit.

**Actions**:

1. **Check for design documents**:

```bash
# Search for design-related files
find . -type f \( -name "*design*" -o -name "*spec*" -o -name "*prd*" -o -name "*plan*" \) -not -path "*/node_modules/*" 2>/dev/null | head -10
```

2. **Check for README with implementation plan**:

```bash
# Display README if it exists in target directory
if [ -f "$ARGUMENTS/README.md" ]; then
  echo "📄 Found README.md - checking for design details:"
  head -50 "$ARGUMENTS/README.md"
fi
```

3. **Check for implementation plan files**:

```bash
# Look for common planning file patterns
find . -type f \( -name "*implementation-plan*.md" -o -name "*task-list*.md" \) -not -path "*/node_modules/*" 2>/dev/null | head -5
```

**If no design documentation found**, ask the user to provide:
- **What**: What feature/functionality is being implemented?
- **Components**: What new components will be created?
- **Changes**: What existing code will be modified?
- **APIs**: What are the API contracts (if applicable)?
- **Data Flow**: How will data flow through the system?
- **Error Handling**: What error scenarios need to be handled?
- **Testing**: What testing strategy will be used?

**Do not proceed to Phase 2 without design documentation or user-provided design details.**

---

### Phase 2: Architecture Review with Validation Checklist

**Purpose**: Run the pre-implementation-architect agent and validate the design against measurable criteria.

**Invoke via Task tool:**
```
Task(
  subagent_type: "pre-implementation-architect",
  prompt: "[validator:pre-implementation-architect] Review the architecture and design for {TARGET_DIRECTORY}. This is the pre-implementation pipeline. Validate against architectural fit, design quality, scope/complexity, and completeness criteria. Return structured JSON OUTPUT with score, decision, and all findings.",
  description: "Architecture review"
)
```

**Threshold**: ≥75 to proceed

#### Error Handling

**If agent invocation fails** (command not found, agent errors, or malformed output):

1. **Report the error**:
   ```
   ⚠️ ARCHITECT AGENT INVOCATION FAILED

   Error: [specific error message]

   Possible causes:
   - Agent command not properly configured
   - Target directory path is invalid
   - Agent file is malformed

   Resolution:
   - Verify /agents:architect command exists
   - Check target directory path: $ARGUMENTS
   - Try running agent manually to diagnose
   ```

2. **Request manual design review**: If the agent cannot run, perform a manual architectural assessment using the criteria below.

3. **Do not proceed without resolution**: Block implementation until either the agent runs successfully OR a manual review is completed.

#### Validation Checklist

After the architect review completes (either via agent or manual), validate the design against these measurable criteria:

**Architectural Fit** (Pass/Fail per item):
- [ ] New code follows naming conventions matching existing files (e.g., if existing files use `UserService.ts`, new services use `*Service.ts` pattern)
- [ ] Directory structure matches existing project layout (e.g., if existing structure is `src/services/`, `src/controllers/`, new files go in appropriate directories)
- [ ] No modifications to existing module internals required (integration uses only public APIs/exports)
- [ ] Import patterns match project standards (e.g., if existing code uses absolute imports via path aliases, new code follows same pattern)

**Design Quality** (Pass/Fail per item):
- [ ] Each component has ≤3 primary responsibilities (single responsibility principle verified by function/class count)
- [ ] No circular import chains introduced (verify via dependency graph or import analysis)
- [ ] No god classes planned (components ≤500 LOC based on design estimate)
- [ ] No anemic wrappers planned (components ≥20 LOC or contain business logic)
- [ ] Dependencies flow from high-level to low-level modules only (e.g., controllers → services → repositories, never reversed)

**Scope & Complexity** (Measurable Thresholds):
- [ ] New code estimate ≤500 LOC (estimate based on design detail)
- [ ] New files count ≤10 files (count planned components from design)
- [ ] New external dependencies ≤3 packages (count npm/pip/etc packages to be added)
- [ ] Complexity is proportional to requirements (no more than 2 abstraction layers for a single-feature implementation)
- [ ] Simpler alternative identified and documented (or explicitly noted why this is the simplest approach)

**Completeness** (Pass/Fail per item):
- [ ] Edge cases documented with expected behavior (minimum: null/undefined inputs, empty arrays/objects, boundary values)
- [ ] Error scenarios have defined handling strategy (minimum: validation errors, network failures, database errors documented with retry/fallback/fail-fast strategy)
- [ ] Data flow documented from entry point to exit point (minimum: request → processing → response path clearly defined)
- [ ] API contracts defined with types/schemas (if applicable: input/output types, status codes, error response formats specified)
- [ ] Testing strategy outlined with coverage targets (minimum: unit test approach defined, integration test scope identified)

#### Gate Decision

- ✅ **PROCEED** (Score ≥75, no critical gaps) → Continue to Phase 3 (if docs exist) or Summary
- 🔄 **REVISE** (Score <75 OR critical gaps exist) → **STOP** - Refine design first

**Critical Gaps (Auto-Fail Conditions)**:

Even if score ≥75, the following issues block implementation:
- Design contradicts existing architecture without documented justification
- Missing error handling strategy for critical paths (authentication, payment, data persistence)
- Scope exceeds single-phase threshold (>500 LOC, >10 files, or >3 new dependencies)
- Circular dependencies would be introduced
- No clear data flow or API contracts for user-facing features
- Breaking changes to existing APIs without migration strategy

**Capture for decision**: All critical gaps, concerns, and suggestions from the architect review.

---

### Phase 3: Documentation Validator (Conditional)

**Runs when**: Design documentation files detected in Step 4 (README.md, design docs, specs, PRDs, or implementation plans)

**Purpose**: Validate that design documentation meets quality standards before implementation begins. Well-documented designs reduce implementation ambiguity and post-implementation drift.

**Invoke via Task tool (if docs detected):**
```
Task(
  subagent_type: "docs-validator",
  prompt: "[validator:docs-validator] Validate documentation quality for {TARGET_DIRECTORY}. This is the pre-implementation pipeline. Focus on design documentation completeness: do design docs clearly describe components, data flow, API contracts, and error handling? Return structured JSON OUTPUT with score, decision, and all findings.",
  description: "Docs validation"
)
```

**Threshold**: ≥75 to proceed

**Focus**:
- Design documentation clarity and completeness
- Consistency between design docs and any existing README
- API contract documentation (if applicable)
- Data flow and architecture diagrams/descriptions

**Capture for features list**: All documentation issues, especially those that could cause implementation ambiguity.

#### Gate Decision

- ✅ **DOCUMENTED** (Score ≥75) → Continue to Summary
- ⚠️ **PARTIALLY_DOCUMENTED** (Score 60-74) → Note gaps, proceed with caution
- 🔄 **UNDERDOCUMENTED** (Score <60) → **STOP** - Improve documentation before coding

**Note:** Unlike architecture review, docs-validator is advisory. Score <75 generates warnings but doesn't block implementation if architect review passed. However, poor documentation often leads to implementation drift.

---

## Completion Status

**Fill instructions**: Replace all bracketed placeholders with actual values from the review:
- `$ARGUMENTS` → actual target directory path
- `[✅ PROCEED / 🔄 REVISE]` → choose one based on architect score
- `[X]` → actual numeric score
- `[✅ Complete / ⚠️ Gaps identified]` → based on completeness checklist results
- `[✅ Appropriate / ⚠️ Too large]` → based on scope metrics (LOC, files, dependencies)
- `[✅ Low / ⚠️ Medium / 🔴 High]` → based on risk assessment from architect review
- `[DOCUMENTED / PARTIALLY / SKIPPED]` → based on docs-validator result (or skipped if no docs)
- `[Specific item to address]` → actual critical gaps or concerns from the review

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PRE-IMPLEMENTATION SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📁 Target: $ARGUMENTS

Architecture Review:    [✅ PROCEED / 🔄 REVISE]
  Score:                [X]/100
  Design Completeness:  [✅ Complete / ⚠️ Gaps identified]
  Scope Assessment:     [✅ Appropriate / ⚠️ Too large]
  Risk Assessment:      [✅ Low / ⚠️ Medium / 🔴 High]

Docs Validation:        [✅ DOCUMENTED / ⚠️ PARTIALLY / ℹ️ SKIPPED]
  Score:                [X]/100 (or N/A if skipped)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[✅ PROCEED - Ready to begin implementation]
OR
[🔄 REVISE - Address the following before coding:]

1. [Specific item to address]
2. [Specific item to address]
3. [Specific item to address]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## Save to Uluops Tracker (MANDATORY)

After completing validation, **you must also** save results to the uluops-tracker MCP server for persistent tracking and cross-run correlation.

**Call the MCP tool** `mcp__uluops-tracker__save_features_list` with:

```
project: {TARGET_NAME}
workflow_type: "pre-implementation"
timestamp: {ISO8601 timestamp, e.g., "2025-01-15T14:30:00Z"}
validators: [
  {
    "name": "pre-implementation-architect",
    "score": {numeric score from architect review},
    "status": "{PROCEED|REVISE}",
    "model": "sonnet",
    "tokens": { "input_tokens": {number}, "output_tokens": {number} }
  },
  // Include docs-validator only if it ran (docs detected)
  {
    "name": "docs-validator",
    "score": {numeric score from docs review},
    "status": "{DOCUMENTED|PARTIALLY_DOCUMENTED|UNDERDOCUMENTED}",
    "model": "sonnet",
    "tokens": { "input_tokens": {number}, "output_tokens": {number} }
  }
]
recommendations: [
  {
    "validator": "pre-implementation-architect",
    "title": "{short title of gap or concern}",
    "priority": "{critical|suggested|backlog}",
    "severity": "{critical|high|medium|low|info}",
    "failure_code": "{DOMAIN-MODE/SEVERITY}",
    "description": "{optional details}",
    "file_path": "{optional file path if applicable}",
    "line_number": {optional line number if applicable}
  },
  // Include docs-validator recommendations if it ran
  {
    "validator": "docs-validator",
    "title": "{short title of doc issue}",
    "priority": "{critical|suggested|backlog}",
    "severity": "{critical|high|medium|low|info}",
    "failure_code": "{DOMAIN-MODE/SEVERITY}",
    "description": "{optional details}",
    "file_path": "{doc file path}"
  },
  // ... one entry per recommendation/gap
]
```

**Priority mapping:**
- Critical gaps (auto-fail conditions) → `"critical"`
- Architectural concerns/suggestions → `"suggested"`
- Future considerations/tech debt → `"backlog"`

**Token estimation guidance:**

Each agent run typically uses 35,000-60,000+ tokens:

| Component | Typical Range | Notes |
|-----------|---------------|-------|
| System context | ~15,000 | Claude Code system prompt, tools, history |
| Agent prompt | 2,000-5,000 | The agent's markdown prompt file |
| Code context | 10,000-30,000 | Files analyzed (varies by project) |
| **Total Input** | **30,000-50,000** | Sum of above |
| Agent output | 3,000-8,000 | Analysis and recommendations |

**Quick estimation by project size:**
- Small (<10 files): ~35,000 input / ~4,000 output
- Medium (10-30 files): ~45,000 input / ~6,000 output
- Large (30+ files): ~60,000+ input / ~8,000 output

**Example MCP call (both validators ran):**

```
mcp__uluops-tracker__save_features_list({
  project: "new-auth-service",
  workflow_type: "pre-implementation",
  timestamp: "2025-01-15T10:30:00Z",
  validators: [
    { name: "pre-implementation-architect", score: 82, status: "PROCEED", model: "sonnet", tokens: { input_tokens: 42000, output_tokens: 5800 } },
    { name: "docs-validator", score: 78, status: "DOCUMENTED", model: "sonnet", tokens: { input_tokens: 35000, output_tokens: 4200 } }
  ],
  recommendations: [
    {
      validator: "pre-implementation-architect",
      title: "Consider caching strategy",
      priority: "suggested",
      description: "Token validation could benefit from caching layer"
    },
    {
      validator: "pre-implementation-architect",
      title: "Document rate limiting approach",
      priority: "backlog",
      description: "Rate limiting mentioned but not fully specified"
    },
    {
      validator: "docs-validator",
      title: "Missing API contract documentation",
      priority: "suggested",
      severity: "medium",
      failure_code: "STR-OMI/M",
      description: "Design doc mentions REST endpoints but no OpenAPI spec or input/output schemas",
      file_path: "docs/design.md"
    }
  ]
})
```

**Benefits of uluops-tracker integration:**
- **Cross-run correlation**: Track design decisions across pre-impl and post-impl phases
- **Regression detection**: Alerts when addressed concerns reappear in later reviews
- **Design debt tracking**: Architectural suggestions that weren't immediately addressed
- **Historical trends**: Track architect scores across projects over time
- **Queryable backlog**: Search and filter design concerns by status/priority

---

## Next Steps

**If approved (PROCEED)**:
- Begin implementation following the validated design
- After each implementation phase, run `/workflows:post-impl $ARGUMENTS`
- Refer back to this review if design questions arise during implementation

**If revision needed (REVISE)**:
- Address all critical gaps identified in the review
- Update design documentation with resolutions
- Re-run `/workflows:pre-impl $ARGUMENTS` to validate the updated design
- Do not begin implementation until PROCEED status achieved

---

## When to Run This Workflow

**Run pre-implementation review when**:
- Starting a new feature or service
- Refactoring existing architecture
- Implementing a user story with technical design
- Adding significant new functionality (>100 LOC)

**Skip pre-implementation review for**:
- Bug fixes that don't change architecture
- Documentation-only changes
- Test-only additions
- Configuration tweaks
- Dependency version updates without API changes

---

## Quick Reference

| Phase | Focus | Threshold | Condition |
|-------|-------|-----------|-----------|
| Gather Context | Find design docs, understand requirements | N/A (informational) | Always |
| Architecture Review | Pattern fit, complexity, completeness | ≥75 to proceed | Always |
| Docs Validation | Documentation quality and completeness | ≥75 (advisory) | If docs detected |

**Execution Modes**: Sequential (default) or Parallel (user-selected)

**Decision Pairs**:
- Architecture: PROCEED (✅) / REVISE (🔄)
- Documentation: DOCUMENTED (✅) / PARTIALLY_DOCUMENTED (⚠️) / UNDERDOCUMENTED (🔄)

**Critical Success Factors**:
- Design documentation exists and is specific
- Architect review score ≥75
- No critical gaps identified
- Scope is appropriate for one implementation phase
- Documentation quality score ≥75 (if docs exist)

**Integration Points**:
- **Before**: Project planning, PRD creation, design discussions
- **After**: `/workflows:post-impl` (run after each implementation phase)

---

## Troubleshooting

### "Agent Task invocation fails"

If the Task tool invocation fails for either agent:
1. Verify the `subagent_type` is correct: `pre-implementation-architect` or `docs-validator`
2. Check that the target directory path is valid
3. Ensure the `[validator:NAME]` tag is included in the prompt
4. Fall back to manual review using the checklist above

### "Design docs not found but design is verbal/in conversation"

If the design was discussed but not documented:
1. Capture the key design decisions in a brief README or design.md
2. Include: components, data flow, API contracts, testing approach
3. Re-run the workflow with the documented design

### "Score is borderline (70-75)"

If the architect score is close to threshold:
1. Review critical gaps carefully - any auto-fail condition should trigger REVISE
2. Consider if proceeding creates significant refactoring risk
3. When in doubt, add clarity to the design and re-run

### "Validation tracker MCP not available"

If the `mcp__uluops-tracker__save_features_list` tool is not available:
1. Check if the uluops-tracker MCP server is configured in your Claude Code settings
2. Verify the MCP server is running
3. The workflow can complete without saving to tracker, but historical tracking will be unavailable

The pre-implementation review is always performed regardless of MCP availability. The uluops-tracker integration is additive—it enables historical tracking but is not required for the workflow to complete.
