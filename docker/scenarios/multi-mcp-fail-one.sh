#!/usr/bin/env bash
#
# Multi-target install with one harness operationally broken.
# Pre-create ~/.config/opencode/opencode.json AS A DIRECTORY so setup's
# JSON write for opencode hits EISDIR. The other two harnesses
# (claude-code, gemini-cli) should install cleanly; opencode should land as
# `failed` in the per-harness summary with a re-run hint; the run should
# exit 1 (operational failure — spec §7.5 4-tier classifier).
#
# Validates Phase 3 failure isolation: one harness's broken state must
# not abort siblings, and the failure must surface clearly enough for
# the user to act on it.

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

# Sabotage opencode's MCP target: pre-create the JSON file as a directory.
# setup's writeFile / atomicWrite into this path will throw EISDIR. The
# per-harness orchestrator must catch this, mark opencode `failed`, and
# move on to siblings.
mkdir -p "$HOME/.config/opencode/opencode.json"

set +e
output=$(setup-tgz \
  --all-detected \
  --api-key=ulr_fake_test_key_000000000000000000 \
  --skip-validation \
  --no-cli \
  --no-agent-metrics-cli \
  --yes 2>&1)
exit_code=$?
set -e

echo "$output"

# Exit code MUST be 1 — operational failure (not user choice)
[ "$exit_code" -eq 1 ] || {
  echo "FAIL: expected exit 1 (operational failure), got $exit_code"
  exit 1
}

# Summary header should be 'Setup finished:' (not 'Setup complete:')
# with mixed counts
echo "$output" | grep -q "Setup finished:" || {
  echo "FAIL: header should be 'Setup finished:' (mixed outcome), not 'Setup complete:'"
  exit 1
}
echo "$output" | grep -q "2 installed" || {
  echo "FAIL: header should report '2 installed'"
  exit 1
}
echo "$output" | grep -q "1 failed" || {
  echo "FAIL: header should report '1 failed'"
  exit 1
}
echo "$output" | grep -q "of 3 harnesses" || {
  echo "FAIL: header should report 'of 3 harnesses'"
  exit 1
}

# Per-harness summary lines
echo "$output" | grep -q "\[Claude Code\] installed" || {
  echo "FAIL: Claude Code should be marked installed in summary"
  exit 1
}
echo "$output" | grep -q "\[Gemini CLI\] installed" || {
  echo "FAIL: Gemini CLI should be marked installed in summary"
  exit 1
}
# OpenCode line: failed marker + error + re-run hint
echo "$output" | grep -q "\[OpenCode\] failed" || {
  echo "FAIL: OpenCode should be marked failed in summary"
  exit 1
}
echo "$output" | grep -q "Re-run: npx @uluops/setup --harness opencode" || {
  echo "FAIL: re-run hint for opencode should appear"
  exit 1
}

# Restart instruction should list the two installed harnesses, NOT opencode
echo "$output" | grep -q "Restart each of Claude Code, Gemini CLI to load agents" || {
  echo "FAIL: restart line should list Claude Code + Gemini CLI (not OpenCode)"
  exit 1
}
echo "$output" | grep -qE "Restart.*OpenCode" && {
  echo "FAIL: restart line should NOT mention OpenCode (it failed)"
  exit 1
}

# State assertions: siblings really installed despite opencode failure
[ -d "$HOME/.claude/agents" ]     || { echo "FAIL: claude agents missing (sibling install regressed)"; exit 1; }
[ -d "$HOME/.gemini" ]            || { echo "FAIL: gemini home missing (sibling install regressed)"; exit 1; }
ls "$HOME/.gemini/" | grep -q settings.json || { echo "FAIL: gemini settings.json missing (sibling install regressed)"; exit 1; }

# Manifest contains claude-code + gemini-cli BUT NOT opencode (no MCP success → no entry)
[ -f "$HOME/.uluops/manifest.json" ] || { echo "FAIL: manifest missing"; exit 1; }
python3 -c "
import json, sys
m = json.loads(sys.stdin.read())
h = m['harnesses']
expected = {'claude-code', 'gemini-cli'}
actual = set(h.keys())
assert actual == expected, f'FAIL: manifest has {sorted(actual)}, expected {sorted(expected)} (opencode should be absent — MCP failed before entry could be written)'
print(f'  manifest harnesses: {sorted(actual)} (opencode correctly absent — pre-MCP failure → no entry)')
" < "$HOME/.uluops/manifest.json"

# The sabotaged file is still a directory — setup didn't accidentally
# delete or coerce it
[ -d "$HOME/.config/opencode/opencode.json" ] || { echo "FAIL: sabotage directory was removed (state corruption)"; exit 1; }

echo "OK: multi-mcp-fail-one — siblings installed despite opencode EISDIR; exit 1; clear failure surface"
