#!/usr/bin/env bash
#
# Gemini CLI harness install → assert state → uninstall → assert state gone,
# while verifying user-owned state survives. Mirrors the Claude Code +
# OpenCode uninstall roundtrips but for the Gemini tree + Gemini-shaped
# config (mcpServers + trust:true + env). Also exercises the AfterTool hook
# install/remove path, which OpenCode (hooks: null) doesn't have.

set -euo pipefail

cd /home/tester
[ "$(cat ~/.uluops-test-marker)" = "uluops-setup-test-container" ]

mkdir -p "$HOME/.gemini/agents"

# Plant a sentinel agent file BEFORE install. Setup must not own it; uninstall
# must not delete it.
echo "sentinel content — user-owned" > "$HOME/.gemini/agents/_sentinel-user-owned.md"

# Plant a third-party MCP entry in Gemini-shaped format. Uninstall must
# leave it intact. Note `mcpServers` key (not `mcp` like opencode).
cat > "$HOME/.gemini/settings.json" <<'JSON'
{
  "mcpServers": {
    "third-party-server": {
      "command": "node",
      "args": ["/some/other/server.js"]
    }
  },
  "hooks": {
    "AfterTool": [
      {
        "matcher": "user-custom",
        "hooks": [{ "type": "command", "command": "echo user-owned" }]
      }
    ]
  }
}
JSON

# Install
setup-tgz \
  --harness gemini-cli \
  --api-key=ulr_fake_test_key_000000000000000000 \
  --skip-validation \
  --no-cli \
  --no-agent-metrics-cli \
  --yes

# Post-install assertions
[ -f "$HOME/.uluops/manifest.json" ]            || { echo "FAIL: manifest missing post-install"; exit 1; }
[ "$(ls $HOME/.gemini/agents | wc -l)" -gt 1 ] || { echo "FAIL: setup didn't add agents alongside sentinel"; exit 1; }

# Merge correctness: uluops servers added, third-party preserved
export HOME
python3 <<'PY'
import json, os
home = os.environ["HOME"]
c = json.load(open(f"{home}/.gemini/settings.json"))
servers = c["mcpServers"]
assert "uluops-tracker" in servers, "FAIL: uluops-tracker not merged"
assert "uluops-registry" in servers, "FAIL: uluops-registry not merged"
assert "third-party-server" in servers, "FAIL: third-party MCP entry was clobbered"
assert servers["uluops-tracker"].get("trust") is True, "FAIL: uluops-tracker missing trust:true"

# Hook merge: user's AfterTool hook must survive alongside uluops's
hooks = c.get("hooks", {}).get("AfterTool", [])
user_hooks   = [e for e in hooks if e.get("matcher") == "user-custom"]
uluops_hooks = [
    e for e in hooks
    if any("agent-metrics" in h.get("command", "") for h in e.get("hooks", []))
]
assert user_hooks,   "FAIL: user-custom AfterTool hook was clobbered"
assert uluops_hooks, "FAIL: uluops agent-metrics AfterTool hook not installed"
print("  post-install merge: PASS (mcp, hooks, trust:true preserved)")
PY

# Uninstall
setup-tgz --uninstall --yes

# Post-uninstall: setup-owned things gone, user-owned things preserved
[ ! -f "$HOME/.uluops/manifest.json" ] \
  || { echo "FAIL: manifest still present after uninstall"; exit 1; }
[ -f "$HOME/.gemini/agents/_sentinel-user-owned.md" ] \
  || { echo "FAIL: uninstall deleted user-owned sentinel agent"; exit 1; }
[ "$(cat $HOME/.gemini/agents/_sentinel-user-owned.md)" = "sentinel content — user-owned" ] \
  || { echo "FAIL: sentinel content was modified"; exit 1; }

# Third-party MCP entry must survive; uluops-* entries must be gone;
# user's AfterTool hook must survive; uluops's AfterTool hook must be gone
python3 <<'PY'
import json, os
home = os.environ["HOME"]
c = json.load(open(f"{home}/.gemini/settings.json"))
servers = c.get("mcpServers", {})
assert "third-party-server" in servers, "FAIL: uninstall deleted user third-party MCP"
assert "uluops-tracker" not in servers, "FAIL: uninstall left uluops-tracker in place"
assert "uluops-registry" not in servers, "FAIL: uninstall left uluops-registry in place"

hooks = c.get("hooks", {}).get("AfterTool", [])
user_hooks   = [e for e in hooks if e.get("matcher") == "user-custom"]
uluops_hooks = [
    e for e in hooks
    if any("agent-metrics" in h.get("command", "") for h in e.get("hooks", []))
]
assert user_hooks,       "FAIL: uninstall deleted user-custom AfterTool hook"
assert not uluops_hooks, "FAIL: uninstall left uluops agent-metrics AfterTool hook in place"
print("  post-uninstall config: PASS (user hooks + third-party MCP preserved; uluops removed)")
PY

# Metrics tool files removed from ~/.gemini/tools/
if [ -d "$HOME/.gemini/tools/agent-metrics" ]; then
  echo "FAIL: uninstall left ~/.gemini/tools/agent-metrics in place"
  exit 1
fi

echo "OK: gemini-uninstall-roundtrip — user-owned state preserved (mcp+hooks), setup state removed"
