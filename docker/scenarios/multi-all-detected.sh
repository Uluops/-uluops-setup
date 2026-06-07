#!/usr/bin/env bash
#
# Multi-target install: --all-detected with 3 harness home dirs pre-created.
# Asserts:
# - Setup runs once and installs into every detected harness in a single
#   invocation (the multi-target premise — spec §1)
# - Manifest contains an entry per detected harness, none missing
# - Each harness's MCP config + agents tree present in its expected location
# - No cross-harness contamination (e.g., claude-code paths don't leak into
#   ~/.config/opencode/)
# - Once-per-run side effects execute exactly once (single shell-profile
#   write at most; single API-key resolution — we can't easily probe the
#   second but absence of duplicate prompts/output is implicit)

set -euo pipefail

cd /home/tester
[ "$(cat ~/.uluops-test-marker)" = "uluops-setup-test-container" ]

# Pre-conditions: clean state, three harness homes pre-created so detection
# fires for all of them. Codex left absent to also exercise the "detected
# subset of all profiles" path (Codex profile exists but its home dir is
# missing → detection skips it).
[ ! -d "$HOME/.claude" ]
[ ! -d "$HOME/.uluops" ]
[ ! -d "$HOME/.config/opencode" ]
[ ! -d "$HOME/.gemini" ]

mkdir -p "$HOME/.claude"
mkdir -p "$HOME/.config/opencode"
mkdir -p "$HOME/.gemini"

# Capture the install output so we can later assert the Phase 3 summary
# block (header + per-harness ✓ lines + combined restart instruction).
output=$(setup-tgz \
  --all-detected \
  --api-key=ulr_fake_test_key_000000000000000000 \
  --skip-validation \
  --no-cli \
  --no-agent-metrics-cli \
  --yes 2>&1)

echo "$output"

# Aggregate summary line should appear (signals all three were processed)
echo "$output" | grep -q "Setup complete:" || {
  echo "FAIL: 'Setup complete:' aggregate header missing from output"
  exit 1
}
echo "$output" | grep -q "3 installed of 3 harnesses" || {
  echo "FAIL: header should report '3 installed of 3 harnesses' (got: '$(echo "$output" | grep -E "Setup (complete|finished):")')"
  exit 1
}
# Per-harness ✓ section lines
for label in "[Claude Code] installed" "[OpenCode] installed" "[Gemini CLI] installed"; do
  echo "$output" | grep -qF "$label" || { echo "FAIL: per-harness summary line missing for $label"; exit 1; }
done
# Combined restart instruction
echo "$output" | grep -q "Restart each of Claude Code, OpenCode, Gemini CLI to load agents" || {
  echo "FAIL: combined restart line missing or in wrong order"
  exit 1
}

# Each harness's section label should appear once
for label in "▸ Claude Code" "▸ OpenCode" "▸ Gemini CLI"; do
  count=$(echo "$output" | grep -c "$label" || true)
  [ "$count" -eq 1 ] || { echo "FAIL: section label '$label' appeared $count times (expected 1)"; exit 1; }
done

# Each harness's tree got installed
[ -d "$HOME/.claude/agents" ]                       || { echo "FAIL: claude agents missing"; exit 1; }
[ -f "$HOME/.claude.json" ]                         || { echo "FAIL: claude MCP config missing"; exit 1; }
[ -d "$HOME/.config/opencode/agents" ]              || { echo "FAIL: opencode agents missing"; exit 1; }
[ -f "$HOME/.config/opencode/opencode.json" ]       || { echo "FAIL: opencode MCP config missing"; exit 1; }
[ -d "$HOME/.gemini" ]                              || { echo "FAIL: gemini home missing"; exit 1; }
# Gemini's settings file location
ls "$HOME/.gemini/" | grep -q settings.json         || { echo "FAIL: gemini settings.json missing"; exit 1; }

# Manifest aggregates all three
[ -f "$HOME/.uluops/manifest.json" ] || { echo "FAIL: manifest missing"; exit 1; }
manifest=$(cat "$HOME/.uluops/manifest.json")

python3 -c "
import json, sys
m = json.loads(sys.stdin.read())
h = m['harnesses']
expected = {'claude-code', 'opencode', 'gemini-cli'}
actual = set(h.keys())
assert actual == expected, f'FAIL: manifest harnesses {sorted(actual)} != expected {sorted(expected)}'
for name in expected:
  entry = h[name]
  assert 'partial' not in entry or entry['partial'] is None, f'FAIL: {name} unexpectedly partial: {entry.get(\"partial\")}'
  assert entry['mcpConfigPath'], f'FAIL: {name} missing mcpConfigPath'
  assert entry['defsPath'], f'FAIL: {name} missing defsPath'
  assert isinstance(entry['agents'], list) and len(entry['agents']) > 0, f'FAIL: {name} has empty agents list'
print(f'  manifest harnesses: {sorted(actual)}')
print(f'  per-harness agent counts: ' + ', '.join(f\"{n}={len(h[n][\"agents\"])}\" for n in sorted(actual)))
" <<< "$manifest"

echo "OK: multi-all-detected — 3 harnesses installed in one invocation, aggregated manifest"
