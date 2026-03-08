---
name: ship
description: Final gate before shipping. Runs 5 core phases (Validate → Type Safety → Test Architect → Code Auditor → Public Interface → Security) plus conditional API Contract/Release Readiness. Persists all recommendations to tracker.
tools: Read, Grep, Glob, Bash
model: sonnet
---

# Ship Pipeline

Final gate before shipping. Runs 5 core phases (Validate → Type Safety → Test Architect → Code Auditor → Public Interface → Security) plus conditional API Contract/Release Readiness. Persists all recommendations to tracker.


**Philosophy**: The final gate before shipping—smart enough to know what checks your project needs.

---

## Workflow Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  CORE PHASES (Always Run)                                                   │
│  ┌──────┐   ┌──────┐   ┌──────┐   ┌──────┐   ┌───────┐   ┌──────┐         │
│  │Validate│─▶│ Type │─▶│ Test │─▶│ Code │─▶│Public │─▶│Security│         │
│  │ Code  │  │Safety*│  │Architect│ │Auditor│  │Interface│  │ Audit │         │
│  └──────┘   └──────┘   └──────┘   └──────┘   └───────┘   └──────┘         │
│      │          │          │          │           │           │             │
│      ▼          ▼          ▼          ▼           ▼           ▼             │
│   PASS/     SAFE/     APPROVED/   SOUND/     POLISHED/    SECURE/          │
│   FAIL      UNSAFE*   IMPROVE     UNSOUND    CLEANUP      BLOCKED          │
│                                                                             │
│  * Type Safety runs only if tsconfig.json exists                           │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│  CONDITIONAL PHASES (Based on Project Type)                                 │
│                                                                             │
│  IF API Routes Detected:        IF Publishable Package:                     │
│  ┌───────────┐                  ┌─────────────┐                            │
│  │API Contract│                  │Release Ready │                           │
│  └───────────┘                  └─────────────┘                            │
│       │                               │                                     │
│       ▼                               ▼                                     │
│   CONSISTENT/                     READY/                                    │
│   DRIFT                           NOT READY                                 │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│  OUTPUTS (Always Run - regardless of pass/fail)                             │
│                                                                             │
│      ┌──────────────────┐          ┌──────────────────┐                    │
│      │  Features List   │          │  Save to Tracker │                    │
│      │  (markdown)      │          │  (MCP tool)      │                    │
│      └────────┬─────────┘          └────────┬─────────┘                    │
│               └──────────┬─────────────────┘                               │
│                          ▼                                                  │
│               ┌──────────────────┐                                         │
│               │  Post-Save       │                                         │
│               │  Verification    │                                         │
│               └──────────────────┘                                         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

```

[TS] = Runs if tsconfig.json detected (TypeScript project)
[API] = Runs if REST routes detected (Express/router patterns)
[PKG] = Runs if publishable package (not private)

Duration: 8-20 minutes (varies with project type)
**Important:** Even in parallel mode, if ANY agent in a group fails with a blocking result, stop the pipeline and report all results collected so far.

---

## Agent Handoff Formats

Each agent passes structured data to the next in the pipeline:

| From | To | Passes | Expects |
|------|-----|--------|---------|
| Code Validator | Type Safety | File list, error baseline, complexity metrics | Type-specific issues beyond basic linting |
| Code Validator | Test Architect | Test file locations, coverage baseline | Test quality assessment beyond coverage % |
| Code Validator | Public Interface | Export list, module structure | Documentation accuracy, unused code detection |
| Test Architect | Code Auditor | Test confidence level, covered paths | Runtime bugs in areas tests miss |
| Code Auditor | Security | Code quality baseline, async patterns | OWASP compliance, vulnerability scan |
| Security | API Contract | Security-cleared codebase | Contract drift on secure API |
| Security | Release Readiness | Security-cleared package | Version and publishing readiness |

**Handoff Contract:**
- Each agent accepts predecessor's score and blockers
- Agents don't re-check validated areas (trust predecessors)
- Critical failures propagate as pipeline blockers
- All findings feed into tracker persistence

---

## Pre-Flight: Target Detection and Configuration

Before running agents, determine the target path and which optional validators should run.

### Context Detection

**Detection criteria**: A detector returns TRUE if its command exits with code 0.

| Detector ID | Description |
|-------------|-------------|
| `typescript_detected` | Check if file exists: {{ target }}/tsconfig.json |
| `package_json_detected` | Check if file exists: package.json |
| `private_package` | Search for pattern ""private":\s*true" in package.json |
| `api_routes_detected` | Search for pattern "router\.|app\.get|app\.post|app\.put|app\.delete" in *.ts, *.js |

**typescript_detected**:
```bash
test -f "{{ target }}/tsconfig.json" && echo "DETECTED" || echo "NOT DETECTED"
```

**package_json_detected**:
```bash
test -f "package.json" && echo "DETECTED" || echo "NOT DETECTED"
```

**private_package**:
```bash
grep -rqE --include="package.json"  ""private":\s*true" . 2>/dev/null && echo "DETECTED" || echo "NOT DETECTED"
```

**api_routes_detected**:
```bash
grep -rqE --include="*.ts" --include="*.js"  "router\.|app\.get|app\.post|app\.put|app\.delete" . 2>/dev/null && echo "DETECTED" || echo "NOT DETECTED"
```


---

## Arguments

### Positional Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| directory | Yes | Target directory to validate |


### Usage Examples

| Command | Behavior |
|---------|----------|
| `/workflows:ship ./packages/bfl-api` | Validates package, detects API routes, runs full pipeline |
| `/workflows:ship ./services/auth-service` | Service validation with API contract checks |
| `/workflows:ship .` | Validates current directory |

---

## Execution Mode Selection

**After completing project detection, ask the user to choose execution mode using AskUserQuestion:**

| Mode | Description | Best For |
|------|-------------|----------|
| Sequential | Run agents one at a time, stop on first failure | Debugging, first runs, when you want early feedback |
| Parallel | Run independent agents concurrently | Speed, CI/CD, when project is stable |

**Parallel execution groups (when parallel mode selected):**

```
Group 1 (gate):     code-validator
                           │
                           ▼
Group 2 (parallel):     type-safety + test-architect + public-interface
                           │
                           ▼
Group 3 (sequential):     code-auditor
                           │
                           ▼
Group 4 (gate):     security
                           │
                           ▼
Group 5 (parallel):     api-contract + release-readiness
                           │
                           ▼
Group 6 (always):     persist-to-tracker
```

**Note:** Conditional validators only run in their groups if detected in pre-flight.

**Important:** Even in parallel mode, if ANY agent in a group fails with a blocking result, stop the pipeline and report all results collected so far.

---

## Execution

Run each agent in sequence (or parallel groups if selected). Stop and fix if any agent fails. **Collect all recommendations for tracker persistence.**

### Phase 1: Code Validation
**Commands**: validate@1.0.0

**Invoke via Task tool:**
```
Task(
  subagent_type: "validate",
  prompt: "[validator:validate] Validate {TARGET_DIRECTORY}. Return structured JSON OUTPUT.",
  description: "Code Validator"
)
```

**Gate**: threshold >= 70, on fail: stop

**Focus**:
- Code quality and standards compliance
- Complexity and maintainability
- Error handling patterns
- Linting and formatting

**Capture for tracker**: All findings, regardless of pass/fail status.

**If failing**: Fix code quality issues before proceeding. Do not ship broken code.

**Decision criteria**:
- PASS (✅): Score ≥70 AND no auto-fail conditions
- FAIL (❌): Score <70 OR auto-fail triggered

---

### Phase 2: Type Safety (Conditional)
**Runs when**: `context.typescript_detected`

**Commands**: type-safety@1.0.0

**Invoke via Task tool:**
```
Task(
  subagent_type: "type-safety",
  prompt: "[validator:type-safety] Validate {TARGET_DIRECTORY}. Return structured JSON OUTPUT.",
  description: "Type Safety Validator"
)
```

**Gate**: threshold >= 80, warn if < 70, on fail: stop

**Why this threshold?** Type holes in shipped code propagate to consumers. Stricter than post-impl because this is the final gate.

**Focus**:
- Explicit any usage and type holes
- Type assertions without runtime guards
- Strict mode compliance
- Public API type quality

**Capture for tracker**: All type safety issues, any abuse, unsafe assertions.

**If failing**: Fix type holes before proceeding. Type safety issues compound—one any infects all downstream code.

**Skip conditions**:
- No tsconfig.json found
- Pure JavaScript project

**Decision criteria**:
- SAFE (✅): Score ≥80 AND no any in public API
- REVIEW (⚠️): Score 70-79 OR minor any usage with justification
- UNSAFE (❌): Score <70 OR any in public API OR critical type holes

**Auto-fail conditions**:
- any in exported function signatures
- Double assertions (as unknown as SomeType pattern)
- strict: false in tsconfig for library code

**Depends on**: code-validator

---

### Phase 3: Test Architecture Review
**Commands**: test-review@1.0.0

**Invoke via Task tool:**
```
Task(
  subagent_type: "test-review",
  prompt: "[validator:test-review] Validate {TARGET_DIRECTORY}. Return structured JSON OUTPUT.",
  description: "Test Architect"
)
```

**Gate**: threshold >= 70, on fail: stop

**Focus**:
- Test quality, not just coverage
- False confidence patterns (mocks at wrong level)
- Critical path coverage
- Edge case handling

**Capture for tracker**: All recommendations for test improvements.

**If failing**: Improve tests before shipping. Ship pipeline requires higher test confidence.

**Decision criteria**:
- APPROVED (✅): Score ≥70 AND critical paths covered
- IMPROVE (❌): Score <70 → Run /fix:test-gaps

**Depends on**: code-validator

---

### Phase 4: Runtime Correctness Audit
**Commands**: audit@1.0.0

**Invoke via Task tool:**
```
Task(
  subagent_type: "audit",
  prompt: "[validator:audit] Validate {TARGET_DIRECTORY}. Return structured JSON OUTPUT.",
  description: "Code Auditor"
)
```

**Gate**: threshold >= 80, warn if < 70, on fail: stop

**Why this threshold?** Code-auditor catches bugs that pass tests. Higher threshold because these are silent production failures.

**Focus**:
- Async hazards (unawaited promises in callbacks)
- Null dereferences (.find() without null check)
- Silent failures (empty catch blocks)
- Error propagation gaps

**Capture for tracker**: All runtime correctness issues with file:line references.

**If failing**: Fix runtime bugs before shipping. These cause production incidents.

**Decision criteria**:
- SOUND (🔒): Score ≥80 AND no auto-fail conditions
- REVIEW (🔍): Score 70-79
- UNSOUND (⛔): Score <70 OR auto-fail triggered

**Auto-fail conditions**:
- Unawaited promise in error callback
- .find() result used without null check
- Empty catch block swallowing errors
- JSON.parse without try/catch
- HTTP response used without status check
- Array access without bounds validation

**Depends on**: test-architect

---

### Phase 5: Public Interface Validation
**Commands**: public-interface@1.0.0

**Invoke via Task tool:**
```
Task(
  subagent_type: "public-interface",
  prompt: "[validator:public-interface] Validate {TARGET_DIRECTORY}. Return structured JSON OUTPUT.",
  description: "Public Interface Validator"
)
```

**Gate**: threshold >= 75, on fail: stop

**Focus**:
- README accuracy and completeness
- Export hygiene (unused exports, missing exports)
- Documentation gaps
- Code cleanliness (unused imports, dead code)

**Capture for tracker**: All documentation gaps and hygiene issues.

**If failing**: Update README, remove dead code, add JSDoc. Consumer-facing polish required for ship.

**Decision criteria**:
- POLISHED (✨): Score ≥75 AND README matches exports
- NEEDS CLEANUP (🧹): Score <75

**Depends on**: code-validator

---

### Phase 6: Security Audit
**Commands**: security@1.0.0

**Invoke via Task tool:**
```
Task(
  subagent_type: "security",
  prompt: "[validator:security] Validate {TARGET_DIRECTORY}. Return structured JSON OUTPUT.",
  description: "Security Analyst"
)
```

**Gate**: threshold >= 85, warn if < 70, on fail: stop

**Why this threshold?** Security is the final gate. Shipping vulnerable code is unacceptable.

**Focus**:
- OWASP Top 10 compliance
- Secrets and credentials exposure
- Dependency vulnerabilities (npm audit)
- Input validation and sanitization
- Authentication and authorization patterns

**Capture for tracker**: All security findings and recommendations.

**If failing**: Fix security issues before shipping. Security is non-negotiable for production.

**Decision criteria**:
- SECURE (✅): Score ≥85 AND no auto-fail conditions
- CONDITIONAL (⚠️): Score 70-84 → Review and document accepted risks
- BLOCKED (❌): Score <70 OR auto-fail triggered

**Auto-fail conditions**:
- Hardcoded secrets/API keys in source code
- SQL injection or command injection confirmed
- Authentication bypass possible
- Critical npm vulnerability (CVSS >= 9.0)
- Secrets in git history
- RCE vector identified

**Depends on**: code-auditor

---

### Phase 7: API Contract Validation (Conditional)
**Runs when**: `context.is_api_service`

**Commands**: api-contract@1.0.0

**Invoke via Task tool:**
```
Task(
  subagent_type: "api-contract",
  prompt: "[validator:api-contract] Validate {TARGET_DIRECTORY}. Return structured JSON OUTPUT.",
  description: "API Contract Validator"
)
```

**Gate**: threshold >= 80, on fail: stop

**Focus**:
- Documentation/implementation alignment
- Type definitions match actual responses
- Breaking changes detection
- Endpoint completeness

**Capture for tracker**: Contract drift issues and sync recommendations.

**If failing**: Sync API contracts before shipping. Consumers depend on accurate documentation.

**Skip conditions**:
- No Express/router patterns detected
- CLI tool only (no HTTP endpoints)

**Decision criteria**:
- CONSISTENT (✅): Score ≥80 AND no drift detected
- DRIFT (⚠️): Score <80 → Sync contracts

**Depends on**: security

---

### Phase 8: Release Readiness (Conditional)
**Runs when**: `context.publishable_package`

**Commands**: release@1.0.0

**Invoke via Task tool:**
```
Task(
  subagent_type: "release",
  prompt: "[validator:release] Validate {TARGET_DIRECTORY}. Return structured JSON OUTPUT.",
  description: "Release Readiness"
)
```

**Gate**: threshold >= 80, warn if < 70, on fail: stop

**Focus**:
- Version consistency (CLI --version matches package.json)
- CHANGELOG has current version entry
- Build is fresh and matches source
- Package.json completeness (main, types, exports)

**Capture for tracker**: Version issues, documentation gaps, release hygiene items.

**If failing**: Fix version and documentation issues before publishing.

**Skip conditions**:
- Private package (private: true)
- No package.json
- Internal tool only

**Decision criteria**:
- READY (✅): Score ≥80 AND versions match AND CHANGELOG current
- WARNINGS (⚠️): Score 70-79 → Review, then continue
- NOT READY (❌): Score <70

**Depends on**: security

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
| code-validator | 15% |
| type-safety | 10% |
| test-architect | 15% |
| code-auditor | 20% |
| public-interface | 10% |
| security | 20% |
| api-contract | 5% |
| release-readiness | 5% |


---

## Final Phase: Outputs (MANDATORY)

**This phase runs regardless of pass/fail status.** All agent recommendations must be captured.

### Artifacts

**features-list** (markdown):

Generate a timestamp for the filename:

```bash
TIMESTAMP=$(date +%Y-%m-%dT%H-%M-%S)
echo "Timestamp: $TIMESTAMP"
```

Write file to: `{{ target_path }}/{{ target_name }}-features-list-{{ timestamp }}.md`

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
  workflow_type: "ship",
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
- Saved count differs from payload count. This is normal when cross-phase deduplication occurs (multiple validators flag the same file:line). Log the discrepancy as a note—do NOT re-attempt or block.

**Verify file exists: {{ target_path }}/{{ target_name }}-features-list-{{ timestamp }}.md**

- On mismatch: **warn** (do NOT block or re-attempt)
- Features list markdown file not found at expected path. Verify the write succeeded.

**Verification procedure:**

1. Query the tracker for the saved run
2. Compare saved recommendation count against your payload count
3. If counts differ, log the discrepancy as a note — cross-phase deduplication is expected when multiple validators flag the same issue
4. **Proceed regardless** — the save already succeeded


---






---

## Quick Reference

| Agent | Threshold | Group |
|-------|-----------|-------|
| Code Validation | threshold >= 70, on fail: stop | 1 |
| Type Safety | threshold >= 80, warn if < 70, on fail: stop | 2 |
| Test Architecture Review | threshold >= 70, on fail: stop | 2 |
| Runtime Correctness Audit | threshold >= 80, warn if < 70, on fail: stop | 3 |
| Public Interface Validation | threshold >= 75, on fail: stop | 2 |
| Security Audit | threshold >= 85, warn if < 70, on fail: stop | 4 |
| API Contract Validation | threshold >= 80, on fail: stop | 5 |
| Release Readiness | threshold >= 80, warn if < 70, on fail: stop | 5 |

**Conditional Validator Activation**:
- **Type Safety**: `context.typescript_detected`
- **API Contract Validation**: `context.is_api_service`
- **Release Readiness**: `context.publishable_package`

---

## Troubleshooting

### Code Auditor keeps flagging async issues that seem fine

Code Auditor uses Opus for deeper reasoning about async patterns. If it flags something, investigate carefully:
- Unawaited promises in callbacks ARE a problem even if tests pass
- .then() without .catch() can silently swallow errors
- Fire-and-forget patterns need explicit documentation

If the pattern is intentional, add a SAFETY comment explaining why.


### Type Safety fails but tsc compiles fine

The Type Safety validator checks beyond compilation:
- any abuse that tsc allows but causes runtime issues
- Type assertions that skip runtime validation
- Implicit any from missing types

tsc with strict mode catches some issues, but the validator looks for patterns that compile but cause consumer problems.


### Security blocks on a dependency vulnerability I cannot upgrade

If a dependency has a known vulnerability but upgrading would break things:
1. Document the risk in the validation report
2. Add a note explaining mitigation (if any)
3. Consider the CONDITIONAL path (score 70-84) for documented accepted risks
4. Create a tracking issue for the upgrade

Never ignore security findings—document the decision.


### Release Readiness says version mismatch but I use semantic-release

With semantic-release CI/CD, versioning is automated. The validator may flag:
- CLI --version showing different version (check if it reads from package.json dynamically)
- CHANGELOG being auto-generated

If you use semantic-release, these are expected. The validator will note "Release Strategy: Semantic Release CI/CD" and adjust expectations.


### API Contract runs but I do not have OpenAPI docs

API Contract validation checks alignment between:
- JSDoc/TSDoc on route handlers
- TypeScript types for request/response
- Any README documentation about endpoints

You don't need formal OpenAPI—the validator checks whatever documentation exists matches implementation.


### Pipeline takes too long in parallel mode

Even in parallel mode, groups run sequentially:
1. Group 1 (gate) must complete first
2. Group 2 (parallel) runs type-safety + test-architect + public-interface
3. Group 3 runs code-auditor (needs test context)
4. Group 4 runs security (final gate)
5. Group 5 runs conditionals in parallel

The bottleneck is usually code-auditor (Opus) and security. These cannot be parallelized because they depend on prior phases.


