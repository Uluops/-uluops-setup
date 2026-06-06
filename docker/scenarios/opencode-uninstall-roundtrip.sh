#!/usr/bin/env bash
#
# OpenCode harness install → assert state → uninstall → assert state gone,
# while verifying user-owned state survives. Mirrors the claude-code
# uninstall-roundtrip but for the opencode tree + opencode-shaped config.

set -euo pipefail

cd /home/tester
[ "$(cat ~/.uluops-test-marker)" = "uluops-setup-test-container" ]

# Note: as of setup 0.7.1 OpenCode does not get commands installed (setup
# prints "Commands not yet supported for OpenCode"), so this scenario only
# exercises agents + MCP. The claude-code scenario covers commands.

mkdir -p "$HOME/.config/opencode/agents"

# Plant a sentinel agent file BEFORE install. Setup must not own it; uninstall
# must not delete it.
echo "sentinel content — user-owned" > "$HOME/.config/opencode/agents/_sentinel-user-owned.md"

# Plant a third-party MCP entry in opencode-shaped format. Uninstall must
# leave it intact.
cat > "$HOME/.config/opencode/opencode.json" <<'JSON'
{
  "mcp": {
    "third-party-server": {
      "type": "local",
      "command": ["node", "/some/other/server.js"],
      "enabled": true
    }
  }
}
JSON

# Install
setup-tgz \
  --harness opencode \
  --api-key=ulr_fake_test_key_000000000000000000 \
  --skip-validation \
  --no-cli \
  --no-agent-metrics-cli \
  --yes

# Post-install assertions
[ -f "$HOME/.uluops/manifest.json" ]            || { echo "FAIL: manifest missing post-install"; exit 1; }
[ -d "$HOME/.config/opencode/agents" ]          || { echo "FAIL: agents dir missing post-install"; exit 1; }
[ "$(ls $HOME/.config/opencode/agents | wc -l)" -gt 1 ] \
  || { echo "FAIL: setup didn't add agents alongside sentinel"; exit 1; }

# Merge correctness: uluops servers added, third-party preserved
python3 -c "
import json
c = json.load(open('$HOME/.config/opencode/opencode.json'))
assert 'uluops-tracker' in c['mcp'], 'FAIL: uluops-tracker not merged in'
assert 'uluops-registry' in c['mcp'], 'FAIL: uluops-registry not merged in'
assert 'third-party-server' in c['mcp'], 'FAIL: third-party MCP entry was clobbered'
print('  post-install merge: PASS')
"

# Uninstall
setup-tgz --uninstall --yes

# Post-uninstall: setup-owned things gone, user-owned things preserved
[ ! -f "$HOME/.uluops/manifest.json" ] \
  || { echo "FAIL: manifest still present after uninstall"; exit 1; }
[ -f "$HOME/.config/opencode/agents/_sentinel-user-owned.md" ] \
  || { echo "FAIL: uninstall deleted user-owned sentinel agent"; exit 1; }
[ "$(cat $HOME/.config/opencode/agents/_sentinel-user-owned.md)" = "sentinel content — user-owned" ] \
  || { echo "FAIL: sentinel content was modified"; exit 1; }

# Third-party MCP entry must survive; uluops-* entries must be gone
python3 -c "
import json
c = json.load(open('$HOME/.config/opencode/opencode.json'))
assert 'third-party-server' in c.get('mcp', {}), 'FAIL: uninstall deleted user third-party MCP'
assert 'uluops-tracker' not in c.get('mcp', {}), 'FAIL: uninstall left uluops-tracker in place'
assert 'uluops-registry' not in c.get('mcp', {}), 'FAIL: uninstall left uluops-registry in place'
print('  post-uninstall config: PASS')
"

echo "OK: opencode-uninstall-roundtrip — user-owned state preserved, setup state removed"
