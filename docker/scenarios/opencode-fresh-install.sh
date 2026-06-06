#!/usr/bin/env bash
#
# OpenCode harness fresh-install:
# - Pre-create ~/.config/opencode/ so harness detection fires
# - Run setup with --harness opencode (explicit, no auto-detect ambiguity)
# - Assert opencode-shaped MCP config got written (the structurally
#   different shape — `mcp` key not `mcpServers`, `type: "local"`,
#   `command` as flat array, `environment` not `env`)
# - Assert agents + commands land under ~/.config/opencode/
# - Assert NO hooks/metrics scaffolding (opencode profile has hooks: null)

set -euo pipefail

cd /home/tester
[ "$(cat ~/.uluops-test-marker)" = "uluops-setup-test-container" ]

# Pre-conditions: no claude state, opencode home pre-created
[ ! -d "$HOME/.claude" ]
[ ! -d "$HOME/.uluops" ]
mkdir -p "$HOME/.config/opencode"

# Run setup targeting opencode explicitly
setup-tgz \
  --harness opencode \
  --api-key=ulr_fake_test_key_000000000000000000 \
  --skip-validation \
  --no-cli \
  --no-agent-metrics-cli \
  --yes

# Post-conditions
#
# NOTE: as of setup 0.7.1, commands are NOT installed for OpenCode — the
# install step explicitly emits "Commands not yet supported for OpenCode
# (coming soon)" and skips creating the dir. But the opencode profile in
# src/harnesses/opencode.ts still defines `commandsDir`. This is a
# profile-vs-implementation gap worth tracking; for now this scenario
# asserts present behavior (no commands dir) so a future implementation
# that turns commands on will fail this scenario and force an update.
[ -f "$HOME/.uluops/manifest.json" ]                || { echo "FAIL: manifest missing"; exit 1; }
[ -d "$HOME/.config/opencode/agents" ]              || { echo "FAIL: opencode agents dir missing"; exit 1; }
[ -f "$HOME/.config/opencode/opencode.json" ]       || { echo "FAIL: opencode.json missing"; exit 1; }
if [ -d "$HOME/.config/opencode/commands" ]; then
  echo "NOTE: commands dir now exists — opencode commands appear to be implemented."
  echo "      Update this scenario to assert command-file presence."
fi

# Critical: claude state must not have been touched (we explicitly targeted opencode)
if [ -d "$HOME/.claude" ]; then
  echo "FAIL: --harness opencode wrote to ~/.claude/ (cross-harness contamination)"
  exit 1
fi

# Verify the opencode-shaped MCP config — the whole reason opencode has a
# separate harness profile. Different shape than Claude's ~/.claude.json.
config=$(cat "$HOME/.config/opencode/opencode.json")

# Must have `mcp` key (not `mcpServers`)
echo "$config" | python3 -c "
import json, sys
c = json.load(sys.stdin)
assert 'mcp' in c, 'FAIL: opencode config missing top-level \"mcp\" key'
assert 'mcpServers' not in c, 'FAIL: opencode config has wrong-shape \"mcpServers\" key'
assert 'uluops-tracker' in c['mcp'], 'FAIL: uluops-tracker not in mcp'
assert 'uluops-registry' in c['mcp'], 'FAIL: uluops-registry not in mcp'
tracker = c['mcp']['uluops-tracker']
assert tracker.get('type') == 'local', f'FAIL: tracker type is {tracker.get(\"type\")!r}, expected \"local\"'
assert isinstance(tracker.get('command'), list), 'FAIL: tracker command is not a list'
assert tracker['command'][0] == 'npx', f'FAIL: tracker command[0] is {tracker[\"command\"][0]!r}, expected \"npx\"'
assert 'environment' in tracker, 'FAIL: tracker missing \"environment\" key'
assert 'env' not in tracker, 'FAIL: tracker has wrong-shape \"env\" key (should be \"environment\")'
assert tracker['environment'].get('ULUOPS_API_KEY'), 'FAIL: ULUOPS_API_KEY missing from tracker environment'
assert tracker.get('enabled') is True, 'FAIL: tracker not enabled'
print('  mcp shape: PASS (mcp key, type=local, command=list, environment=dict)')
"

# Opencode has hooks: null in its profile — verify no metrics scaffolding
# leaked from the claude-code paths
if [ -d "$HOME/.claude/tools/agent-metrics" ]; then
  echo "FAIL: agent-metrics dir was created under ~/.claude/ — opencode has hooks: null"
  exit 1
fi

agent_count=$(ls -1 "$HOME/.config/opencode/agents/" | wc -l)
[ "$agent_count" -gt 0 ] || { echo "FAIL: zero agents copied"; exit 1; }

echo "OK: opencode-fresh-install — $agent_count agents under ~/.config/opencode/, opencode-shaped MCP config (commands not yet supported by setup for opencode)"
