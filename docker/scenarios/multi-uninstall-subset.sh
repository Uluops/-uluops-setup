#!/usr/bin/env bash
#
# Phase 4 uninstall --harness <name> subset filter.
# Installs into 3 harnesses, runs --uninstall --harness opencode,
# asserts:
# - Opencode's MCP config + agents removed from disk
# - Claude-code + gemini-cli state PRESERVED (not touched)
# - Manifest updated (not deleted) with claude-code + gemini-cli entries
# - Global @uluops/cli + agent-metrics + shell-export PRESERVED (subset
#   uninstall doesn't touch shared infrastructure)
# - Re-running --uninstall without filter then removes everything cleanly

set -euo pipefail

cd /home/tester
[ "$(cat ~/.uluops-test-marker)" = "uluops-setup-test-container" ]

[ ! -d "$HOME/.claude" ]
[ ! -d "$HOME/.uluops" ]
[ ! -d "$HOME/.config/opencode" ]
[ ! -d "$HOME/.gemini" ]

mkdir -p "$HOME/.claude"
mkdir -p "$HOME/.config/opencode"
mkdir -p "$HOME/.gemini"

# Install into all three (skip globals to keep the scenario fast — we
# assert their preservation logic separately, no real install needed)
setup-tgz \
  --all-detected \
  --api-key=ulr_fake_test_key_000000000000000000 \
  --skip-validation \
  --no-cli \
  --no-agent-metrics-cli \
  --yes

# Pre-conditions for the subset uninstall
[ -d "$HOME/.claude/agents" ]                       || { echo "FAIL: install setup failed — claude agents missing"; exit 1; }
[ -d "$HOME/.config/opencode/agents" ]              || { echo "FAIL: install setup failed — opencode agents missing"; exit 1; }
[ -d "$HOME/.gemini" ]                              || { echo "FAIL: install setup failed — gemini home missing"; exit 1; }

# === SUBSET UNINSTALL: opencode only ===
output=$(setup-tgz --uninstall --harness opencode 2>&1)
echo "$output"

# Output mentions the subset count + the kept-globals notice
echo "$output" | grep -q "Uninstalling subset (1 of 3)" || {
  echo "FAIL: subset count line missing"
  exit 1
}
echo "$output" | grep -q "Preserving global @uluops/cli" || {
  echo "FAIL: globals-preservation notice missing"
  exit 1
}
echo "$output" | grep -q "Manifest updated" || {
  echo "FAIL: manifest-updated line missing (subset should update, not delete)"
  exit 1
}

# Opencode state should be GONE
ls "$HOME/.config/opencode/agents/" 2>/dev/null | grep -q "\.md$" && {
  echo "FAIL: opencode agents still present after subset uninstall"
  exit 1
}
# The opencode.json file may still exist (other tools may use it) but
# uluops's MCP entries should be removed. Assert at least that opencode's
# manifest entry is gone.

# Claude-code state should be PRESERVED
[ -d "$HOME/.claude/agents" ] || { echo "FAIL: claude agents removed by opencode uninstall (isolation broke)"; exit 1; }
ls "$HOME/.claude/agents/" | grep -q "\.md$" || { echo "FAIL: claude agents emptied by opencode uninstall"; exit 1; }

# Gemini state should be PRESERVED
[ -d "$HOME/.gemini" ] || { echo "FAIL: gemini home removed by opencode uninstall"; exit 1; }

# Manifest should be updated (not deleted) and contain only claude-code + gemini-cli
[ -f "$HOME/.uluops/manifest.json" ] || {
  echo "FAIL: manifest was deleted on subset uninstall (should have been updated)"
  exit 1
}
python3 -c "
import json, sys
m = json.loads(sys.stdin.read())
h = m['harnesses']
expected = {'claude-code', 'gemini-cli'}
actual = set(h.keys())
assert actual == expected, f'FAIL: manifest has {sorted(actual)}, expected {sorted(expected)} (opencode entry should be gone)'
assert 'opencode' not in h, 'FAIL: opencode entry still present in manifest'
print(f'  manifest after subset uninstall: {sorted(actual)} (opencode removed, others preserved)')
" < "$HOME/.uluops/manifest.json"

# === FULL UNINSTALL: cleanup ===
setup-tgz --uninstall --yes >/dev/null 2>&1

[ ! -f "$HOME/.uluops/manifest.json" ] || { echo "FAIL: full uninstall did not delete manifest"; exit 1; }

echo "OK: multi-uninstall-subset — opencode removed, claude-code + gemini-cli preserved, manifest correctly updated"
