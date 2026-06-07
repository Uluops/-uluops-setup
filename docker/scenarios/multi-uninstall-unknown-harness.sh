#!/usr/bin/env bash
#
# Phase 4 uninstall --harness <unknown> fails fast.
# Installs claude-code, runs --uninstall --harness opencode (not in
# manifest), asserts:
# - Exit code non-zero
# - Error message names the unknown harness AND what IS in the manifest
# - claude-code state UNTOUCHED (fail before any work happens)

set -euo pipefail

cd /home/tester
[ "$(cat ~/.uluops-test-marker)" = "uluops-setup-test-container" ]

[ ! -d "$HOME/.claude" ]
[ ! -d "$HOME/.uluops" ]

setup-tgz \
  --harness claude-code \
  --api-key=ulr_fake_test_key_000000000000000000 \
  --skip-validation \
  --no-cli \
  --no-agent-metrics-cli \
  --yes

[ -f "$HOME/.uluops/manifest.json" ] || { echo "FAIL: install did not produce manifest"; exit 1; }

# Now try to uninstall opencode (not in manifest)
set +e
output=$(setup-tgz --uninstall --harness opencode 2>&1)
exit_code=$?
set -e

echo "$output"

# Non-zero exit
[ "$exit_code" -ne 0 ] || { echo "FAIL: unknown harness in filter should exit non-zero (got $exit_code)"; exit 1; }

# Error message names the unknown harness
echo "$output" | grep -q "Unknown harness in --harness filter: opencode" || {
  echo "FAIL: error should name 'opencode' as unknown"
  exit 1
}
# And lists what IS in the manifest so user can correct
echo "$output" | grep -q "Manifest contains: claude-code" || {
  echo "FAIL: error should list what's actually in the manifest"
  exit 1
}

# Claude-code state must be UNTOUCHED (fail-fast before any work)
[ -d "$HOME/.claude/agents" ] || { echo "FAIL: claude agents removed despite fail-fast"; exit 1; }
ls "$HOME/.claude/agents/" | grep -q "\.md$" || { echo "FAIL: claude agents emptied despite fail-fast"; exit 1; }
[ -f "$HOME/.uluops/manifest.json" ] || { echo "FAIL: manifest removed despite fail-fast"; exit 1; }

echo "OK: multi-uninstall-unknown-harness — fail-fast on unknown filter, state untouched, helpful error message"
