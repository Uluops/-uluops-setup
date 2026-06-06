#!/usr/bin/env bash
#
# Gemini CLI harness fresh-install:
# - Pre-create ~/.gemini/ so harness detection fires
# - Run setup with --harness gemini-cli (explicit, no auto-detect ambiguity)
# - Assert MCP config has the Gemini-specific `trust: true` field
# - Assert agents + commands + metrics tools land under ~/.gemini/
# - Assert hooks installed in ~/.gemini/settings.json with the
#   AfterTool/invoke_agent shape (Gemini-specific, different from Claude's
#   SubagentStop)
# - Assert NO ~/.claude/ contamination from the explicit --harness target

set -euo pipefail

cd /home/tester
[ "$(cat ~/.uluops-test-marker)" = "uluops-setup-test-container" ]

# Pre-conditions: no other harness state, gemini home pre-created
[ ! -d "$HOME/.claude" ]
[ ! -d "$HOME/.config/opencode" ]
[ ! -d "$HOME/.uluops" ]
mkdir -p "$HOME/.gemini"

# Run setup targeting gemini-cli explicitly
setup-tgz \
  --harness gemini-cli \
  --api-key=ulr_fake_test_key_000000000000000000 \
  --skip-validation \
  --no-cli \
  --no-agent-metrics-cli \
  --yes

# Post-conditions: gemini tree populated
[ -f "$HOME/.uluops/manifest.json" ]                || { echo "FAIL: manifest missing"; exit 1; }
[ -d "$HOME/.gemini/agents" ]                       || { echo "FAIL: gemini agents dir missing"; exit 1; }
[ -d "$HOME/.gemini/commands" ]                     || { echo "FAIL: gemini commands dir missing"; exit 1; }
[ -f "$HOME/.gemini/settings.json" ]                || { echo "FAIL: gemini settings.json missing"; exit 1; }

# No cross-harness contamination
if [ -d "$HOME/.claude" ]; then
  echo "FAIL: --harness gemini-cli wrote to ~/.claude/ (cross-harness contamination)"
  exit 1
fi
if [ -d "$HOME/.config/opencode" ]; then
  echo "FAIL: --harness gemini-cli wrote to ~/.config/opencode/ (cross-harness contamination)"
  exit 1
fi

# Verify the Gemini-shaped MCP config + hook shape via heredoc (avoids bash
# escaping inside python -c "..."). HOME is exported so python can read it.
export HOME
python3 <<'PY'
import json, os
home = os.environ["HOME"]
c = json.load(open(f"{home}/.gemini/settings.json"))

# Shape: mcpServers key (NOT mcp like opencode)
assert "mcpServers" in c, "FAIL: gemini config missing 'mcpServers' key"
assert "mcp" not in c, "FAIL: gemini config has wrong-shape 'mcp' key (opencode's shape)"
servers = c["mcpServers"]
assert "uluops-tracker" in servers, "FAIL: uluops-tracker not in mcpServers"
assert "uluops-registry" in servers, "FAIL: uluops-registry not in mcpServers"

tracker = servers["uluops-tracker"]
# Gemini-specific: trust=True required for smooth tool execution
assert tracker.get("trust") is True, (
    f"FAIL: tracker.trust is {tracker.get('trust')!r}, expected True"
)
# Claude-shape env, not opencode-shape environment
assert "env" in tracker, "FAIL: tracker missing 'env' key"
assert "environment" not in tracker, (
    "FAIL: tracker has 'environment' key (opencode's shape)"
)
assert tracker["env"].get("ULUOPS_API_KEY"), (
    "FAIL: ULUOPS_API_KEY missing from tracker env"
)
print("  mcp shape: PASS (mcpServers key, trust=True, env=dict)")

# Hook shape: AfterTool + invoke_agent matcher + agent-metrics command
hooks = c.get("hooks", {})
assert "AfterTool" in hooks, (
    f"FAIL: hooks missing AfterTool event (got {list(hooks.keys())})"
)
found = False
for e in hooks["AfterTool"]:
    if e.get("matcher") == "invoke_agent":
        for h in e.get("hooks", []):
            if "agent-metrics" in h.get("command", ""):
                found = True
                break
assert found, (
    "FAIL: no AfterTool hook with matcher=invoke_agent invoking agent-metrics"
)
print("  hook shape: PASS (AfterTool + invoke_agent matcher + agent-metrics command)")
PY

# Metrics tool files copied into Gemini's tools dir
[ -d "$HOME/.gemini/tools/agent-metrics" ]          || { echo "FAIL: metrics tools dir missing under ~/.gemini/"; exit 1; }
[ -f "$HOME/.gemini/tools/agent-metrics/dist/hook.js" ] || { echo "FAIL: metrics hook.js missing"; exit 1; }

agent_count=$(ls -1 "$HOME/.gemini/agents/" | wc -l)
# Gemini's commands tree is split into subdirs (agents/, workflows/, pipelines/),
# so count recursively. Otherwise we'd count 3 subdirs instead of 28 files.
cmd_count=$(find "$HOME/.gemini/commands/" -type f \( -name '*.md' -o -name '*.toml' \) | wc -l)
[ "$agent_count" -gt 0 ] || { echo "FAIL: zero agents copied"; exit 1; }
[ "$cmd_count"   -gt 0 ] || { echo "FAIL: zero commands copied"; exit 1; }

echo "OK: gemini-fresh-install — $agent_count agents + $cmd_count commands under ~/.gemini/, trust=true mcpServers, AfterTool hook"
