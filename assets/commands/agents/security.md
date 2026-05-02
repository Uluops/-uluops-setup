---
name: security
description: Run comprehensive security audit on a project. Use as FINAL gate before deployment. Scans for vulnerabilities, OWASP compliance, and security best practices.
model: sonnet
---

# Security Analyst
Run comprehensive security audit on a project. Use as FINAL gate before deployment. Scans for vulnerabilities, OWASP compliance, and security best practices.

## Arguments

**Usage:** `/agents:security <directory>`

**Examples:**
- `/agents:security ./src`
- `/agents:security ./services/auth`
- `/agents:security .`

**Target Directory:** $ARGUMENTS

---

## Pre-Flight

```bash
echo "Running security audit on $ARGUMENTS..."
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

Run the Security Analyst agent on the validated target directory:

**Agent:** security-analyst-agent.md
**Model:** Sonnet
**Target:** $ARGUMENTS

The agent performs code quality validation across 6 categories (100 points total):

| Category | Points | Focus |
|----------|--------|-------|
| Secrets & Credentials | 20 | No hardcoded keys, passwords, or tokens in code |
| Injection Prevention | 20 | SQL, command, XSS, and path traversal prevention |
| Authentication & Authorization | 20 | JWT handling, password hashing, and access control |
| Data Protection | 15 | Secure cookies, encryption, and PII handling |
| Dependencies | 15 | npm audit clean and no known vulnerabilities |
| Security Configuration | 10 | Headers, CORS, error handling, debug mode |

---

## Auto-Fail Conditions

Critical issues that trigger immediate FAIL regardless of score:

| ID | Condition |
|----|-----------|
| **AF-001** | Hardcoded secrets or API keys in source code |
| **AF-002** | SQL injection or command injection confirmed |
| **AF-003** | Authentication bypass possible |
| **AF-004** | Critical npm vulnerability (CVSS >= 9.0) |
| **AF-005** | Secrets committed in git history |
| **AF-006** | RCE (Remote Code Execution) vector identified |

---

## Decision Thresholds

| Score | Decision | Meaning |
|-------|----------|---------|
| **>=85** | ✅ PASS | Validation passed, proceed to next phase |
| **<85** | ❌ FAIL | Validation failed, fix issues before proceeding |

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
**CDL Source:** `/home/alexs/uluops/uluops-agent-workflows/udl/cdl/v1/security.command.yaml`
**Agent:** `agents/security-analyst-agent.md`
