#!/usr/bin/env bash
#
# Install → assert state present → uninstall → assert state gone.
# Also verifies uninstall doesn't touch state setup didn't create
# (the "uninstall scope" concern Alex flagged).

set -euo pipefail

cd /home/tester
[ "$(cat ~/.uluops-test-marker)" = "uluops-setup-test-container" ]

# Plant a sentinel agent file BEFORE install. Setup must not own it; uninstall
# must not delete it.
mkdir -p "$HOME/.claude/agents"
echo "sentinel content — user-owned" > "$HOME/.claude/agents/_sentinel-user-owned.md"

# Plant a third-party MCP entry too. Same rule — uninstall must leave it.
mkdir -p "$HOME"
cat > "$HOME/.claude.json" <<'JSON'
{
  "mcpServers": {
    "third-party-server": { "command": "node", "args": ["/some/other/server.js"] }
  }
}
JSON

# Install
setup-tgz \
  --api-key=ulr_fake_test_key_000000000000000000 \
  --skip-validation \
  --no-cli \
  --no-agent-metrics-cli \
  --yes

# Post-install assertions
[ -f "$HOME/.uluops/manifest.json" ] || { echo "FAIL: manifest missing post-install"; exit 1; }
[ -d "$HOME/.claude/agents" ]        || { echo "FAIL: agents dir missing post-install"; exit 1; }
[ "$(ls $HOME/.claude/agents | wc -l)" -gt 1 ] || { echo "FAIL: setup didn't add agents alongside sentinel"; exit 1; }

# Setup must have merged its MCP servers into the user's existing config —
# not clobbered it
grep -q "uluops-tracker" "$HOME/.claude.json" || { echo "FAIL: uluops-tracker MCP not merged in"; exit 1; }
grep -q "third-party-server" "$HOME/.claude.json" || { echo "FAIL: third-party MCP entry was clobbered"; exit 1; }

# Uninstall
setup-tgz --uninstall --yes

# Post-uninstall: setup-owned things gone, user-owned things preserved
[ ! -f "$HOME/.uluops/manifest.json" ] || { echo "FAIL: manifest still present after uninstall"; exit 1; }
[ -f "$HOME/.claude/agents/_sentinel-user-owned.md" ] || { echo "FAIL: uninstall deleted the user-owned sentinel agent"; exit 1; }
[ "$(cat $HOME/.claude/agents/_sentinel-user-owned.md)" = "sentinel content — user-owned" ] \
  || { echo "FAIL: sentinel content was modified"; exit 1; }

# Third-party MCP entry must survive; uluops-* entries must be gone
grep -q "third-party-server" "$HOME/.claude.json" || { echo "FAIL: uninstall deleted user's third-party MCP entry"; exit 1; }
if grep -q "uluops-tracker" "$HOME/.claude.json"; then
  echo "FAIL: uninstall left uluops-tracker MCP entry in place"
  exit 1
fi

echo "OK: uninstall-roundtrip — user-owned state preserved, setup state removed"
