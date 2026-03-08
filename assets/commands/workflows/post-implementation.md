---
name: post-implementation
description: Iterative validation workflow. Run after each implementation phase until all agents pass. Includes code optimization. Use --frontend flag for React/Tailwind projects.
tools: Read, Grep, Glob, Bash
model: sonnet
---

# Post-Implementation

Iterative validation workflow. Run after each implementation phase until all agents pass. Includes code optimization. Use --frontend flag for React/Tailwind projects.


**Philosophy**: Validate early, validate often. Each implementation phase should pass all gates before proceeding. Catch issues when they're cheap to fix.

---

## Workflow Overview

```
┌─────────────┐
│  validate   │ ◄── Gate (must pass)
└──────┬──────┘
       │
┌──────┴──────┬──────────────┬──────────────┐
▼             ▼              ▼              │
┌───────────┐ ┌────────────┐ ┌────────────┐ │
│type-safety│ │mcp-validate│ │test-review │ │
│(if TS)    │ │(if MCP)    │ │            │ │
└─────┬─────┘ └─────┬──────┘ └─────┬──────┘ │
      └─────────────┴──────────────┘        │
                    │                       │
             ┌──────▼──────┐                │
             │  optimizer  │                │
             └──────┬──────┘                │
                    │                       │
       ┌────────────┴────────────┐          │
       ▼                         ▼          │
┌────────────────┐     ┌──────────────┐     │
│public-interface│     │   frontend   │     │
│                │     │ (if enabled) │     │
└────────────────┘     └──────────────┘     │
                                            │
══════════════════════════════════════════  │
    PERSIST TO TRACKER (Required)           │
══════════════════════════════════════════  ▼

```

[TS] = Runs if tsconfig.json detected (TypeScript project)
[MCP] = Runs if MCP server detected (mcp imports, FastMCP, @modelcontextprotocol/sdk)

Duration: 6-15 minutes (varies with optional validators)
**Note:** Conditional validators only run in their groups if detected in pre-flight.
**Important:** Even in parallel mode, if ANY agent in a group fails with a blocking result, stop the pipeline and report all results collected so far.

---

## Agent Handoff Formats

Each agent passes structured data to the next in the pipeline:

| From | To | Passes | Expects |
|------|-----|--------|---------|
| Code Validator | TypeScript Validator | File list, error baseline, complexity metrics | Type-specific issues beyond basic linting |
| Code Validator | Test Architect | Test file locations, coverage baseline | Test quality assessment beyond coverage % |
| TypeScript Validator | MCP Validator | Type-checked file list, public API map | Protocol compliance on type-safe codebase |
| MCP Validator | Test Architect | Tools/resources list, security flags | Tests for MCP-specific functionality |
| Test Architect | Optimizer | Test confidence level, coverage gaps | Optimizations that won't break tested behavior |
| Optimizer | Public Interface | Refactoring summary, API changes | README updates for any interface changes |
| Public Interface | Frontend Validator | Export list, documentation status | Component quality for documented features |

**Handoff Contract:**
- Each agent accepts predecessor's score and blockers
- Agents don't re-check validated areas
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
| `mcp_python_detected` | Run command: grep -rqE --include="*.py" --exclude-dir="node_modules" --exclude-dir="dist" --exclude-dir="__pycache__" --exclude-dir=".venv" "from mcp|import mcp|FastMCP|@mcp\." . 2>/dev/null |
| `mcp_typescript_detected` | Run command: grep -rqE --include="*.ts" --include="*.js" --exclude-dir="node_modules" --exclude-dir="dist" "@modelcontextprotocol/sdk|McpServer" . 2>/dev/null |
| `mcp_dependency_detected` | Run command: grep -rqE --include="package.json" --include="pyproject.toml" --include="requirements.txt" --exclude-dir="node_modules" --exclude-dir="dist" "@modelcontextprotocol|\"mcp\":" . 2>/dev/null |
| `frontend_detected` | Run command: test -n "$(find . \( -name "*.tsx" -o -name "*.jsx" \) ! -path "*/node_modules/*" ! -path "*/dist/*" ! -path "*/build/*" ! -path "*/.next/*" ! -path "*/coverage/*" -print -quit 2>/dev/null)" |

**typescript_detected**:
```bash
test -f "{{ target }}/tsconfig.json" && echo "DETECTED" || echo "NOT DETECTED"
```

**mcp_python_detected**:
```bash
grep -rqE --include="*.py" --exclude-dir="node_modules" --exclude-dir="dist" --exclude-dir="__pycache__" --exclude-dir=".venv" "from mcp|import mcp|FastMCP|@mcp\." . 2>/dev/null && echo "DETECTED" || echo "NOT DETECTED"
```

**mcp_typescript_detected**:
```bash
grep -rqE --include="*.ts" --include="*.js" --exclude-dir="node_modules" --exclude-dir="dist" "@modelcontextprotocol/sdk|McpServer" . 2>/dev/null && echo "DETECTED" || echo "NOT DETECTED"
```

**mcp_dependency_detected**:
```bash
grep -rqE --include="package.json" --include="pyproject.toml" --include="requirements.txt" --exclude-dir="node_modules" --exclude-dir="dist" "@modelcontextprotocol|\"mcp\":" . 2>/dev/null && echo "DETECTED" || echo "NOT DETECTED"
```

**frontend_detected**:
```bash
test -n "$(find . \( -name "*.tsx" -o -name "*.jsx" \) ! -path "*/node_modules/*" ! -path "*/dist/*" ! -path "*/build/*" ! -path "*/.next/*" ! -path "*/coverage/*" -print -quit 2>/dev/null)" && echo "DETECTED" || echo "NOT DETECTED"
```


---

## Arguments

### Positional Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| target | No | Target directory to validate |

### Flags

| Flag | Short | Description |
|------|-------|-------------|
| --frontend | f | Force frontend validation regardless of auto-detection |

### Usage Examples

| Command | Behavior |
|---------|----------|
| `/workflows:post-implementation ./packages/api` | Auto-detects TS, MCP, and frontend |
| `/workflows:post-implementation ./packages/app --frontend` | Forces frontend validation |
| `/workflows:post-implementation ./mcp-server` | Auto-detects MCP server, runs MCP Validator |
| `/workflows:post-implementation ./src` | Skips optional validators if not detected |

---

## Execution Mode Selection

**After completing project detection, ask the user to choose execution mode using AskUserQuestion:**

| Mode | Description | Best For |
|------|-------------|----------|
| Sequential | Run agents one at a time, stop on first failure | Debugging, first runs, when you want early feedback |
| Parallel | Run independent agents concurrently | Speed, CI/CD, when project is stable |

**Parallel execution groups (when parallel mode selected):**

```
Group 1 (gate):     validate
                           │
                           ▼
Group 2 (parallel):     type-safety + mcp-validator + test-architect
                           │
                           ▼
Group 3 (sequential):     optimizer
                           │
                           ▼
Group 4 (parallel):     public-interface + frontend
                           │
                           ▼
Group 5 (always):     persist-to-tracker
```

**Note:** Conditional validators only run in their groups if detected in pre-flight.

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
- Correctness and type safety
- Complexity and best practices
- Error handling patterns

**Capture for tracker**: All findings for tracker, regardless of pass/fail status.

**If failing**: Fix code quality issues before proceeding. Do not optimize broken code.

---

### Phase 2: TypeScript Validation (Conditional)
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

**Gate**: threshold >= 75, on fail: stop

**Focus**:
- Explicit any usage and type holes
- Type assertions without runtime guards
- Strict mode compliance
- Public API type quality

**Capture for tracker**: All type safety issues for tracker, especially those affecting public API.

**If failing**: Fix type holes before proceeding. Type safety issues compound—one any infects all downstream code.

**Skip conditions**:
- No tsconfig.json found
- Pure JavaScript project

**Decision criteria**:
- SAFE (🔒): Score ≥80 AND no any in public API AND no critical assertions
- REVIEW (🔍): Score 75-79 OR minor any usage with justification
- UNSAFE (⚠️): Score <75 OR any in public API OR critical type holes

**Auto-fail conditions**:
- any in exported function signatures
- Double assertions (as unknown as SomeType pattern)
- strict: false in tsconfig for library code

**Depends on**: validate

---

### Phase 3: MCP Protocol Validation (Conditional)
**Runs when**: `context.mcp_detected`

**Commands**: mcp-validate@1.0.0

**Invoke via Task tool:**
```
Task(
  subagent_type: "mcp-validate",
  prompt: "[validator:mcp-validate] Validate {TARGET_DIRECTORY}. Return structured JSON OUTPUT.",
  description: "MCP Validator"
)
```

**Gate**: threshold >= 80, warn if < 65, on fail: stop

**Why this threshold?** MCP protocol violations cause silent failures in AI integrations. Unlike code bugs that throw visible errors, broken MCP servers manifest as 'the AI doesn't respond' from end users.

**Focus**:
- Tools implementation (inputSchema, descriptions, error handling)
- Resources implementation (valid URIs, MIME types, descriptions)
- Prompts implementation (arguments documented, proper message structure)
- Transport and protocol compliance
- Security best practices (input validation, no command injection)

**Capture for tracker**: All MCP compliance issues for tracker, especially auto-fail conditions.

**If failing**: Fix protocol compliance issues before proceeding. Broken MCP servers cause silent failures in AI integrations.

**Skip conditions**:
- No MCP imports or SDK usage detected
- No mcp-related dependencies in package files
- Pure client-side application

**Decision criteria**:
- COMPLIANT (✅): Score ≥80 AND no auto-fail conditions → Pipeline CONTINUES
- CONDITIONAL (⚠️): Score 65-79 → Pipeline CONTINUES with warnings
- NON-COMPLIANT (❌): Score <65 OR auto-fail triggered → Pipeline FAILS

**Auto-fail conditions**:
- Missing JSON-RPC message handling
- No capability declaration in server initialization
- Tools without inputSchema definitions
- Hardcoded secrets in tool implementations
- No error handling for tool execution failures
- Direct eval() or exec() of user-provided input

**Depends on**: validate

---

### Phase 4: Test Architecture Review
**Commands**: test-review@1.0.0

**Invoke via Task tool:**
```
Task(
  subagent_type: "test-review",
  prompt: "[validator:test-review] Validate {TARGET_DIRECTORY}. Return structured JSON OUTPUT.",
  description: "Test Architect"
)
```

**Gate**: threshold >= 70, on fail: warn

**Focus**:
- Test quality, not just coverage
- False confidence patterns (mocks at wrong level)
- Critical path coverage
- Mutation testing readiness

**Capture for tracker**: All recommendations for tracker.

**If failing**: Improve tests before optimizing. Tests validate that optimizations do not break behavior.

**Depends on**: validate

---

### Phase 5: Code Optimization Analysis
**Commands**: optimize@1.0.0

**Invoke via Task tool:**
```
Task(
  subagent_type: "optimize",
  prompt: "[validator:optimize] Validate {TARGET_DIRECTORY}. Return structured JSON OUTPUT.",
  description: "Code Optimizer"
)
```

**Gate**: threshold >= 75, on fail: warn

**Focus**:
- Duplication and structure
- Hot path performance
- Maintainability

**Capture for tracker**: All optimization opportunities for tracker, including deferred items.

**If failing**: Address high-impact findings. This agent reports only—apply fixes manually.

**Depends on**: test-architect

---

### Phase 6: Public Interface Validation
**Commands**: public-interface@1.0.0

**Invoke via Task tool:**
```
Task(
  subagent_type: "public-interface",
  prompt: "[validator:public-interface] Validate {TARGET_DIRECTORY}. Return structured JSON OUTPUT.",
  description: "Public Interface Validator"
)
```

**Gate**: threshold >= 75, on fail: warn

**Focus**:
- Feature completeness in README
- Documentation accuracy
- Code hygiene (unused imports, dead code)
- Export quality

**Capture for tracker**: All documentation gaps and hygiene issues for tracker.

**If failing**: Update README, remove dead code, add JSDoc. Consumer-facing polish.

**Depends on**: optimizer

---

### Phase 7: Frontend Validation (Conditional)
**Runs when**: `context.frontend_enabled`

**Commands**: frontend-validate@1.0.0

**Invoke via Task tool:**
```
Task(
  subagent_type: "frontend-validate",
  prompt: "[validator:frontend-validate] Validate {TARGET_DIRECTORY}. Return structured JSON OUTPUT.",
  description: "frontend-validate"
)
```

**Gate**: threshold >= 75, on fail: warn

**Focus**:
- Component quality (single responsibility, typed props, hooks patterns)
- Accessibility (semantic HTML, ARIA, keyboard navigation)
- Theme consistency (no dark: prefixes, conditional className with useTheme())
- Performance patterns (memoization, keys, lazy loading)

**Capture for tracker**: All accessibility issues, theme violations, and component quality findings for tracker.

**If failing**: Fix critical accessibility issues first, then theme violations, then component quality.

**Skip conditions**:
- No --frontend flag AND no .tsx/.jsx files detected
- Backend-only changes
- Configuration or documentation only changes

**Decision criteria**:
- POLISHED (✅): Score 80+ AND no critical accessibility issues AND theme system used correctly
- ACCEPTABLE (🟡): Score 70+ AND no critical issues
- NEEDS WORK (❌): Score below 70 OR critical accessibility OR theme violations

**Depends on**: optimizer

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
| validate | 25% |
| type-safety | 15% |
| mcp-validator | 10% |
| test-architect | 15% |
| optimizer | 10% |
| public-interface | 15% |
| frontend | 10% |


---





---

## Iteration Pattern

```
Implementation
     │
     ▼
/workflows:post-implementation
     │
     ├── Run all agents
     │
     ├── Persist to tracker (ALWAYS)
     │
     ├── All pass? ──▶ /workflows:ship ──▶ 🚀
     │
     └── Failures? ──▶ Fix issues (use features list as checklist)
                           │
                           └──▶ /workflows:post-implementation (repeat)
                                 │
                                 └── Updates features list with new run number

```

**Typical iterations**:
- Clean implementation: 1-2 runs
- Complex feature: 2-4 runs
- Major refactor: 3-5 runs

**Report behavior across iterations**:
- Each run creates a new timestamped file (e.g., api-features-list-2026-01-13T14-30-52.md)
- Previous runs are preserved for audit trail
- Resolved items from previous runs will not appear in new runs if agents no longer flag them
- Consider adding *-features-list-*.md to .gitignore to avoid committing validation artifacts

---

## Quick Reference

| Agent | Threshold | Group |
|-------|-----------|-------|
| Code Validation | threshold >= 70, on fail: stop | 1 |
| TypeScript Validation | threshold >= 75, on fail: stop | 2 |
| MCP Protocol Validation | threshold >= 80, warn if < 65, on fail: stop | 2 |
| Test Architecture Review | threshold >= 70, on fail: warn | 2 |
| Code Optimization Analysis | threshold >= 75, on fail: warn | 3 |
| Public Interface Validation | threshold >= 75, on fail: warn | 4 |
| Frontend Validation | threshold >= 75, on fail: warn | 4 |

**Conditional Validator Activation**:
- **TypeScript Validation**: `context.typescript_detected`
- **MCP Protocol Validation**: `context.mcp_detected`
- **Frontend Validation**: `context.frontend_enabled`

---

## Troubleshooting

### Optimizer keeps finding issues after I fix them

The optimizer may surface new issues as you refactor. This is expected—each fix can reveal deeper patterns. Set a practical limit:
- 3 iterations max for optimizer
- After that, remaining issues become tech debt (document in features list under Deferred)


### Public Interface says feature undocumented but it is intentionally internal

If a feature is intentionally undocumented (internal API, experimental), note it in the features list but categorize as Deferred or add a note explaining it is intentional.


### Tests pass but Test Architect scores low

Test Architect evaluates *quality*, not pass/fail. Passing tests with mocks at the wrong level provide false confidence. Trust the agent—improve the tests. The features list will track what needs improvement.


### TypeScript Validator keeps flagging my any usage

The validator is intentionally strict about any because type holes propagate. One any in your code becomes any in consumer code. If any is genuinely necessary:
1. Add a SAFETY comment explaining why
2. Isolate it to a boundary layer (e.g., third-party API adapters)
3. Consider using unknown with type guards instead


### MCP Validator runs but my server is not using standard patterns

The MCP Validator looks for common patterns from FastMCP (Python) and @modelcontextprotocol/sdk (TypeScript). If you are using a custom MCP implementation:
- The validator may miss tool/resource/prompt definitions
- You may need to manually verify protocol compliance
- Consider adding standard decorators/handlers for auto-detection


### Frontend Validator keeps flagging dark:prefixes

This is intentional. The project uses a custom theme system via useTheme() hook. Replace:

className="bg-white dark:bg-gray-900"

With:

const { resolvedTheme } = useTheme();
className={resolvedTheme === 'light' ? 'bg-white' : 'bg-gray-900'}


