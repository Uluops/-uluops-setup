#!/usr/bin/env bash
#
# Multi-target install: --harness claude-code,codex explicit subset.
# Asserts:
# - Comma-separated --harness parses correctly into a 2-element list
# - Only the named harnesses are installed (no auto-expansion to detected
#   set when --harness is explicit)
# - Manifest has exactly two entries (no opencode/gemini even if their
#   home dirs exist — explicit always wins)
# - User-typed order is honored in per-harness section ordering (cosmetic,
#   spec §10.3)

set -euo pipefail

cd /home/tester
[ "$(cat ~/.uluops-test-marker)" = "uluops-setup-test-container" ]

# Pre-conditions: pre-create EVERY harness home dir so detection would have
# fired for all of them. The test then asserts that explicit --harness
# overrides detection — only the named subset gets installed.
[ ! -d "$HOME/.claude" ]
[ ! -d "$HOME/.uluops" ]
[ ! -d "$HOME/.config/opencode" ]
[ ! -d "$HOME/.gemini" ]
[ ! -d "$HOME/.codex" ]

mkdir -p "$HOME/.claude"
mkdir -p "$HOME/.config/opencode"
mkdir -p "$HOME/.gemini"
mkdir -p "$HOME/.codex"

output=$(setup-tgz \
  --harness claude-code,codex \
  --api-key=ulr_fake_test_key_000000000000000000 \
  --skip-validation \
  --no-cli \
  --no-agent-metrics-cli \
  --yes 2>&1)

echo "$output"

# Per-harness section ordering: claude-code BEFORE codex (user-typed order
# per spec §10.3)
claude_line=$(echo "$output" | grep -n "▸ Claude Code" | head -1 | cut -d: -f1)
codex_line=$(echo "$output" | grep -n "▸ Codex" | head -1 | cut -d: -f1)
[ -n "$claude_line" ] && [ -n "$codex_line" ] || { echo "FAIL: missing section label(s) — claude_line='$claude_line' codex_line='$codex_line'"; exit 1; }
[ "$claude_line" -lt "$codex_line" ] || { echo "FAIL: user-typed order not honored (claude line $claude_line should precede codex line $codex_line)"; exit 1; }

# OpenCode and Gemini sections must NOT appear (not in the explicit list)
echo "$output" | grep -q "▸ OpenCode" && { echo "FAIL: OpenCode section appeared despite not being in --harness list"; exit 1; }
echo "$output" | grep -q "▸ Gemini CLI" && { echo "FAIL: Gemini CLI section appeared despite not being in --harness list"; exit 1; }

# Aggregate summary "2 installed of 2"
echo "$output" | grep -q "Setup complete:" || { echo "FAIL: 'Setup complete:' header missing"; exit 1; }
echo "$output" | grep -q "2 installed of 2 harnesses" || { echo "FAIL: should report '2 installed of 2 harnesses' (got: '$(echo "$output" | grep -E "Setup (complete|finished):")')"; exit 1; }
echo "$output" | grep -qF "[Claude Code] installed" || { echo "FAIL: per-harness ✓ line for Claude Code missing"; exit 1; }
echo "$output" | grep -qF "[Codex] installed" || { echo "FAIL: per-harness ✓ line for Codex missing"; exit 1; }
echo "$output" | grep -q "Restart each of Claude Code, Codex to load agents" || { echo "FAIL: combined restart line missing or wrong order"; exit 1; }

# State assertions
[ -d "$HOME/.claude/agents" ]   || { echo "FAIL: claude agents missing"; exit 1; }
[ -f "$HOME/.claude.json" ]     || { echo "FAIL: claude MCP config missing"; exit 1; }
[ -d "$HOME/.codex/agents" ]    || { echo "FAIL: codex agents missing"; exit 1; }
[ -f "$HOME/.codex/config.toml" ] || { echo "FAIL: codex MCP config missing"; exit 1; }

# Critical: opencode + gemini must NOT have been touched (their home dirs
# exist but no UluOps state was written there)
[ ! -d "$HOME/.config/opencode/agents" ] || { echo "FAIL: --harness claude-code,codex wrote to opencode (cross-harness contamination)"; exit 1; }
[ ! -f "$HOME/.config/opencode/opencode.json" ] || { echo "FAIL: opencode.json was written despite opencode not being in --harness list"; exit 1; }
# Gemini settings.json is the harness's own file; what we check is that
# UluOps didn't add its servers to it. The cleanest signal: settings.json
# should not exist if UluOps didn't write it.
[ ! -f "$HOME/.gemini/settings.json" ] || { echo "FAIL: gemini settings.json was written despite gemini-cli not being in --harness list"; exit 1; }

manifest=$(cat "$HOME/.uluops/manifest.json")
python3 -c "
import json, sys
m = json.loads(sys.stdin.read())
h = m['harnesses']
expected = {'claude-code', 'codex'}
actual = set(h.keys())
assert actual == expected, f'FAIL: manifest has {sorted(actual)}, expected {sorted(expected)} (subset honored?)'
print(f'  manifest harnesses: {sorted(actual)} (no opencode/gemini contamination)')
" <<< "$manifest"

echo "OK: multi-explicit-subset — only claude-code+codex installed; opencode/gemini untouched"
