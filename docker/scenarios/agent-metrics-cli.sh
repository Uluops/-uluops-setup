#!/usr/bin/env bash
#
# Regression test for CHANGELOG [0.7.1].
#
# Setup is run via npx, which puts `agent-metrics` (a transitive bin from
# setup's own runtime dep) on PATH for the spawned process. The 0.7.0
# detect heuristic falsely concluded "already installed" and skipped the
# global install. After npx exited, the user got `command not found`.
#
# This scenario passes only if `agent-metrics` is on PATH in a NEW shell
# spawned after the npx process exits — exactly the user's experience.

set -euo pipefail

cd /home/tester
[ "$(cat ~/.uluops-test-marker)" = "uluops-setup-test-container" ]

# Pre-condition: clean global tree, no agent-metrics installed anywhere
# the user would see it.
if npm ls -g @uluops/agent-metrics --depth=0 >/dev/null 2>&1; then
  echo "FAIL: pre-condition violated — @uluops/agent-metrics is already in the global tree"
  exit 1
fi

# Run setup with --with-agent-metrics-cli (skips the interactive prompt,
# instructs setup to install agent-metrics globally).
npx --yes /pkg/setup.tgz \
  --api-key=ulr_fake_test_key_000000000000000000 \
  --skip-validation \
  --no-cli \
  --with-agent-metrics-cli \
  --yes

# Spawn a FRESH bash subshell — its PATH is the user's PATH, not the npx
# transient PATH. This is the actual user experience after npx exits.
fresh_path_check=$(bash -lc 'command -v agent-metrics || true')
if [ -z "$fresh_path_check" ]; then
  echo "FAIL: agent-metrics not on PATH after setup ran"
  echo "      (this is the 0.7.0 regression: detect falsely returned 'already installed')"
  exit 1
fi

# And it should be a real binary that prints --version
version=$(bash -lc 'agent-metrics --version' 2>&1 || true)
if [ -z "$version" ]; then
  echo "FAIL: agent-metrics found at $fresh_path_check but --version failed"
  exit 1
fi

# Sanity: confirm the resolved bin lives in the global npm prefix, not in
# some npx cache (which would also be a regression: install succeeded but
# only put the bin in a transient location).
global_prefix=$(npm prefix -g)
case "$fresh_path_check" in
  "$global_prefix"/*) ;;
  *)
    echo "WARN: agent-metrics resolves to $fresh_path_check"
    echo "      expected somewhere under $global_prefix"
    # not a hard fail — alternate global prefixes are valid
    ;;
esac

echo "OK: agent-metrics on PATH ($fresh_path_check, $version)"
