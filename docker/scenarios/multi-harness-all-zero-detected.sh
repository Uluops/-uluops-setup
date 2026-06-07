#!/usr/bin/env bash
#
# --harness all with ZERO harnesses detected → fall back to default
# (claude-code). The landing-page "just run npx @uluops/setup" promise
# is preserved even when the user picks the multi-install flag and
# nothing is on the box.

set -euo pipefail

cd /home/tester
[ "$(cat ~/.uluops-test-marker)" = "uluops-setup-test-container" ]

# Pre-conditions: NO harness home dirs exist. detectHarnesses() returns
# an empty list.
[ ! -d "$HOME/.claude" ]
[ ! -d "$HOME/.uluops" ]
[ ! -d "$HOME/.config/opencode" ]
[ ! -d "$HOME/.gemini" ]
[ ! -d "$HOME/.codex" ]

output=$(setup-tgz \
  --harness all \
  --api-key=ulr_fake_test_key_000000000000000000 \
  --skip-validation \
  --no-cli \
  --no-agent-metrics-cli \
  --yes 2>&1)

echo "$output"

# Only one harness should appear (the fallback)
echo "$output" | grep -q "▸ Claude Code" || { echo "FAIL: claude-code fallback section missing"; exit 1; }
echo "$output" | grep -q "▸ OpenCode" && { echo "FAIL: OpenCode section appeared despite no detection"; exit 1; }
echo "$output" | grep -q "▸ Gemini CLI" && { echo "FAIL: Gemini CLI section appeared despite no detection"; exit 1; }
echo "$output" | grep -q "▸ Codex" && { echo "FAIL: Codex section appeared despite no detection"; exit 1; }

# No aggregate summary (only one harness in the run)
echo "$output" | grep -q "Setup complete:" && {
  echo "FAIL: multi-harness 'Setup complete:' header appeared for single-harness fallback run"
  exit 1
}
# Single-harness path uses the legacy 'Setup complete!' banner instead
echo "$output" | grep -q "Setup complete!" || {
  echo "FAIL: single-harness banner 'Setup complete!' missing"
  exit 1
}

# claude-code state was created (the fallback installed)
[ -d "$HOME/.claude/agents" ] || { echo "FAIL: claude agents missing — fallback didn't install"; exit 1; }
[ -f "$HOME/.uluops/manifest.json" ] || { echo "FAIL: manifest missing"; exit 1; }

manifest=$(cat "$HOME/.uluops/manifest.json")
python3 -c "
import json, sys
m = json.loads(sys.stdin.read())
h = m['harnesses']
assert set(h.keys()) == {'claude-code'}, f'FAIL: manifest has {sorted(h.keys())}, expected just claude-code fallback'
print('  fallback honored: claude-code installed despite --harness all with zero detected')
" <<< "$manifest"

echo "OK: multi-harness-all-zero-detected — --harness all fell back to claude-code"
