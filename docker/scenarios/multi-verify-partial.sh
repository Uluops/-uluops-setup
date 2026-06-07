#!/usr/bin/env bash
#
# Phase 4 verify partial-install warning.
# Installs into claude-code, then manually edits the manifest to flip
# `partial: "agents"` on the entry. Asserts that --verify surfaces the
# partial-install warning row and exits non-zero — partial state never
# "passes" verify.

set -euo pipefail

cd /home/tester
[ "$(cat ~/.uluops-test-marker)" = "uluops-setup-test-container" ]

[ ! -d "$HOME/.claude" ]
[ ! -d "$HOME/.uluops" ]

# Install cleanly first (no detection sabotage)
setup-tgz \
  --harness claude-code \
  --api-key=ulr_fake_test_key_000000000000000000 \
  --skip-validation \
  --no-cli \
  --no-agent-metrics-cli \
  --yes

[ -f "$HOME/.uluops/manifest.json" ] || { echo "FAIL: install did not produce manifest"; exit 1; }

# Sabotage the manifest entry: set partial: "agents" on the claude-code
# entry. Use python to keep JSON re-serialization stable + recompute the
# contentHash so the manifest loader's tamper-detection doesn't trigger
# the wrong warning during the verify path.
python3 <<'PY'
import json, hashlib, pathlib
path = pathlib.Path.home() / ".uluops" / "manifest.json"
raw = path.read_text()
m = json.loads(raw)
m["harnesses"]["claude-code"]["partial"] = "agents"
# Drop the existing hash, re-serialize, recompute hash with the same
# canonical form setup uses (2-space indent + trailing newline).
m.pop("contentHash", None)
without_hash = json.dumps(m, indent=2) + "\n"
new_hash = hashlib.sha256(without_hash.encode()).hexdigest()
m["contentHash"] = new_hash
path.write_text(json.dumps(m, indent=2) + "\n")
print("  manifest sabotaged: partial='agents' on claude-code entry")
PY

# Run verify, capture output + exit code
set +e
output=$(node /pkg/setup.tgz --verify 2>&1 || true)
# Actually we need to run npx --yes /pkg/setup.tgz, not bare node — the
# tarball IS a tarball not a script. Use the setup-tgz wrapper.
output=$(setup-tgz --verify 2>&1)
exit_code=$?
set -e

echo "$output"

# Verify exited non-zero (partial state isn't passing)
[ "$exit_code" -ne 0 ] || {
  echo "FAIL: verify should exit non-zero on partial manifest entry (got $exit_code)"
  exit 1
}

# Warning row mentions partial install + step name + re-run hint
echo "$output" | grep -q "partial install" || {
  echo "FAIL: 'partial install' label missing from verify output"
  exit 1
}
echo "$output" | grep -q 'failed at "agents"' || {
  echo "FAIL: failed step name 'agents' missing from verify output"
  exit 1
}
echo "$output" | grep -q "Re-run: npx @uluops/setup --harness claude-code" || {
  echo "FAIL: re-run hint missing from verify output"
  exit 1
}

# The other per-file checks still ran (recorded lists are honest)
echo "$output" | grep -q "MCP config present" || {
  echo "FAIL: MCP config check should still run on partial entry"
  exit 1
}

echo "OK: multi-verify-partial — partial warning surfaced, exit $exit_code, per-file checks still ran"
