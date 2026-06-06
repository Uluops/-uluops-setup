#!/usr/bin/env bash
#
# Smoke test: `npx /pkg/setup.tgz` succeeds on a clean OS with no Claude Code
# state. The "no harness detected → fall back to claude-code" path runs.

set -euo pipefail

cd /home/tester

# Sanity: confirm we're inside the test container, not a host shell
[ "$(cat ~/.uluops-test-marker)" = "uluops-setup-test-container" ]

# Ensure no pre-existing state
[ ! -d "$HOME/.claude" ]
[ ! -d "$HOME/.uluops" ]

# `setup-tgz` is a wrapper baked into the image that handles the
# `cd /pkg && npx --yes ./setup.tgz` quirk (see Dockerfile). The npx cache
# + transient-PATH semantics are identical to `npx @uluops/setup` against
# the real registry — what we need to reproduce the 0.7.0 bug class.
# --skip-validation avoids hitting api.uluops.ai (no network stub here).
setup-tgz \
  --api-key=ulr_fake_test_key_000000000000000000 \
  --skip-validation \
  --no-cli \
  --no-agent-metrics-cli \
  --yes

# Post-conditions: claude harness tree got created
[ -d "$HOME/.claude/agents" ]    || { echo "FAIL: agents dir missing"; exit 1; }
[ -d "$HOME/.claude/commands" ]  || { echo "FAIL: commands dir missing"; exit 1; }
[ -f "$HOME/.uluops/manifest.json" ] || { echo "FAIL: manifest missing"; exit 1; }

# At least some agents copied
agent_count=$(ls -1 "$HOME/.claude/agents/" | wc -l)
[ "$agent_count" -gt 0 ] || { echo "FAIL: zero agents copied"; exit 1; }

echo "OK: fresh-install — $agent_count agents copied, manifest present"
