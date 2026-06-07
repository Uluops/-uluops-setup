#!/usr/bin/env bash
#
# --harness <name> --all-detected → conflicting flags, exit 1 with explicit
# error message before any state is touched.

set -euo pipefail

cd /home/tester
[ "$(cat ~/.uluops-test-marker)" = "uluops-setup-test-container" ]

[ ! -d "$HOME/.claude" ]
[ ! -d "$HOME/.uluops" ]

# Intentionally NOT using `set -e` for the setup call — we expect non-zero
# exit and want to inspect the message + exit code.
set +e
output=$(setup-tgz \
  --harness codex \
  --all-detected \
  --api-key=ulr_fake_test_key_000000000000000000 \
  --skip-validation \
  --no-cli \
  --no-agent-metrics-cli \
  --yes 2>&1)
exit_code=$?
set -e

echo "$output"

# Exit code should be non-zero (fail fast on conflicting flags)
[ "$exit_code" -ne 0 ] || { echo "FAIL: conflicting flags should exit non-zero (got $exit_code)"; exit 1; }

# Explicit error message should name the conflict
echo "$output" | grep -q "conflicts with --all-detected" || {
  echo "FAIL: error message should mention 'conflicts with --all-detected'"
  exit 1
}
echo "$output" | grep -q "codex" || {
  echo "FAIL: error message should name the conflicting --harness value"
  exit 1
}

# Critical: NO state should have been touched (fail-fast before any
# install work)
[ ! -d "$HOME/.claude/agents" ] || { echo "FAIL: claude agents created despite fail-fast"; exit 1; }
[ ! -d "$HOME/.codex/agents" ] || { echo "FAIL: codex agents created despite fail-fast"; exit 1; }
[ ! -d "$HOME/.uluops" ] || { echo "FAIL: ~/.uluops/ created despite fail-fast"; exit 1; }

echo "OK: multi-flag-conflict — exit $exit_code, error message clear, no state touched"
