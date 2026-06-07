#!/usr/bin/env bash
#
# Non-interactive multi-detect (CI compatibility — spec §10.1).
# When multiple harnesses are detected AND the run is non-interactive
# (--yes + --api-key), preserve today's behavior: install into the first
# detected harness only, surface a dimmed notice naming the others.
#
# This is the friction-positive choice the spec acknowledges: CI users
# who want multi-install must opt in with --all-detected. Without this
# scenario, an inversion of the default would silently expand the install
# surface for every existing scripted invocation.

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

# --yes triggers the non-interactive path. No --harness, no --all-detected.
output=$(setup-tgz \
  --api-key=ulr_fake_test_key_000000000000000000 \
  --skip-validation \
  --no-cli \
  --no-agent-metrics-cli \
  --yes 2>&1)

echo "$output"

# The dimmed notice should appear, naming the detected harnesses
echo "$output" | grep -q "Multiple harnesses detected" || {
  echo "FAIL: dimmed-notice 'Multiple harnesses detected' missing"
  exit 1
}
echo "$output" | grep -q "Claude Code" || {
  echo "FAIL: dimmed notice should mention the chosen default 'Claude Code'"
  exit 1
}
echo "$output" | grep -q -- "--all-detected to install into all" || {
  echo "FAIL: dimmed notice should hint at --all-detected"
  exit 1
}

# Only Claude Code (the first detected) should have installed
[ -d "$HOME/.claude/agents" ] || { echo "FAIL: claude agents missing"; exit 1; }
[ ! -d "$HOME/.config/opencode/agents" ] || { echo "FAIL: opencode installed despite non-interactive default"; exit 1; }
[ ! -f "$HOME/.gemini/settings.json" ] || { echo "FAIL: gemini installed despite non-interactive default"; exit 1; }

# Multi-harness summary header should NOT appear (only 1 harness processed)
echo "$output" | grep -q "Setup complete:" && {
  echo "FAIL: multi-harness 'Setup complete:' header appeared for single-harness CI-compat run"
  exit 1
}
# Single-harness banner SHOULD appear
echo "$output" | grep -q "Setup complete!" || {
  echo "FAIL: single-harness banner 'Setup complete!' missing"
  exit 1
}

manifest=$(cat "$HOME/.uluops/manifest.json")
python3 -c "
import json, sys
m = json.loads(sys.stdin.read())
h = m['harnesses']
assert set(h.keys()) == {'claude-code'}, f'FAIL: manifest has {sorted(h.keys())}, expected just claude-code'
print('  manifest harnesses: claude-code only — CI compatibility preserved')
" <<< "$manifest"

echo "OK: multi-non-interactive-default — first-detected installed, dimmed notice surfaced others"
