---
name: mcp-validate
description: Validate Model Context Protocol (MCP) server implementation. Validates tools, resources, prompts, transport, and security.
---

# MCP Validator
Validate Model Context Protocol (MCP) server implementation. Validates tools, resources, prompts, transport, and security.

## Arguments

**Usage:** `/agents:mcp-validate <directory>`

**Examples:**
- `/agents:mcp-validate ./servers/my-mcp`
- `/agents:mcp-validate ./mcp-tools`
- `/agents:mcp-validate .`

**Target Directory:** $ARGUMENTS

---

## Pre-Flight

```bash
echo "Running MCP validation on $ARGUMENTS..."
echo "======================================="
```

Verify the target directory exists:

```bash
test -d "$ARGUMENTS" && echo "✓ Directory exists: $ARGUMENTS" || echo "ERROR: Directory '$ARGUMENTS' not found"
```

Enter and confirm location:

```bash
cd "$ARGUMENTS" && pwd
```

Check path exists:

```bash
[ -e "$ARGUMENTS" ] && echo "✓ $ARGUMENTS exists" || echo "Target directory does not exist"
```


---

## Agent Invocation

Run the MCP Validator agent on the validated target directory:

**Agent:** mcp-validator-agent.md
**Model:** Sonnet
**Target:** $ARGUMENTS

The agent performs code quality validation across 5 categories (100 points total):

| Category | Points | Focus |
|----------|--------|-------|
| Tools Implementation | 25 | Tool definitions, schemas, descriptions, error handling |
| Resources Implementation | 20 | Resource URIs, templates, MIME types, subscriptions |
| Prompts Implementation | 15 | Prompt templates, arguments, usage patterns |
| Transport & Protocol | 20 | JSON-RPC, initialization, capabilities, versioning |
| Security & Best Practices | 20 | Input validation, authorization, error handling |

---

## Auto-Fail Conditions

Critical issues that trigger immediate FAIL regardless of score:

| ID | Condition |
|----|-----------|
| **AF-001** | Missing JSON-RPC message handling |
| **AF-002** | No capability declaration in server initialization |
| **AF-003** | Tools without inputSchema definitions |
| **AF-004** | Hardcoded secrets in tool implementations |
| **AF-005** | No error handling for tool execution failures |
| **AF-006** | Direct eval() or exec() of user-provided input |

---

## Decision Thresholds

| Score | Decision | Meaning |
|-------|----------|---------|
| **>=80** | ✅ PASS | Validation passed, proceed to next phase |
| **<80** | ❌ FAIL | Validation failed, fix issues before proceeding |

**Note:** Any critical issue triggers FAIL regardless of score.

---


## PERSIST TO TRACKER (Required)

> **IMPORTANT:** Save to tracker IMMEDIATELY after agent completes, BEFORE presenting the summary to the user. The workflow is not complete until results are persisted.
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
| `json.result.decision` | `validators[].status` | PASS/FAIL |
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

**CDL Schema:** `udl/definition-languages/cdl-schema-v1.1.0.json`
**CDL Source:** `/home/alexs/uluops/uluops-agent-workflows/udl/cdl/v1/mcp-validate.command.yaml`
**Agent:** `agents/mcp-validator-agent.md`
