#!/usr/bin/env bash
#
# @uluops/setup test substrate driver.
#
# Loop: build current setup repo → npm pack → mount tarball into a fresh
# disposable container → run the named scenario → report exit code.
#
# Usage:
#   docker/test.sh                       # runs the default scenario (fresh-install)
#   docker/test.sh agent-metrics-cli     # named scenario from docker/scenarios/
#   docker/test.sh -- shell              # drop into an interactive shell in the image
#   IMAGE_TAG=uluops-test:v2 docker/test.sh  # use a custom image tag
#
# The image is built on first run (or when the Dockerfile changes) and
# reused after — per-iteration cost is just `npm pack` + `docker run`.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PKG_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
IMAGE_TAG="${IMAGE_TAG:-uluops-setup-test:latest}"

# Color helpers (only when stdout is a tty)
if [ -t 1 ]; then
  C_DIM="$(printf '\033[2m')"; C_BOLD="$(printf '\033[1m')"
  C_RED="$(printf '\033[31m')"; C_GREEN="$(printf '\033[32m')"
  C_YELLOW="$(printf '\033[33m')"; C_RESET="$(printf '\033[0m')"
else
  C_DIM=""; C_BOLD=""; C_RED=""; C_GREEN=""; C_YELLOW=""; C_RESET=""
fi

scenario="${1:-fresh-install}"
shift || true

# Preflight: confirm a Docker daemon is reachable. The `docker` CLI on its own
# tells you nothing useful when the daemon is down — it just emits a raw
# socket error. Hitting the daemon with `docker info` is fast (<100ms when up)
# and gives us a clean place to surface install/start guidance.
if ! docker info >/dev/null 2>&1; then
  echo "${C_RED}✗${C_RESET} Docker daemon is not reachable."
  echo
  echo "  The Docker CLI is installed, but no daemon backend is running."
  echo "  Common macOS backends:"
  echo "    • OrbStack:        ${C_BOLD}brew install --cask orbstack${C_RESET} && open -a OrbStack"
  echo "    • Colima:          ${C_BOLD}brew install colima${C_RESET} && ${C_BOLD}colima start${C_RESET}"
  echo "    • Docker Desktop:  install from docker.com, then launch it"
  echo
  echo "  Once the daemon is up, ${C_BOLD}docker info${C_RESET} should succeed; then re-run this script."
  exit 1
fi

# Special-case "shell" — interactive shell in the image, useful for poking
# around manually without writing a scenario script.
if [ "$scenario" = "shell" ]; then
  echo "${C_DIM}→${C_RESET} Building image $IMAGE_TAG (cached if unchanged)"
  docker build -q -t "$IMAGE_TAG" "$SCRIPT_DIR" >/dev/null
  echo "${C_DIM}→${C_RESET} Packing $PKG_ROOT for tarball mount"
  cd "$PKG_ROOT"
  npm run build >/dev/null
  TGZ="$(npm pack --silent | tail -n1)"
  trap "rm -f '$PKG_ROOT/$TGZ'" EXIT
  echo "${C_DIM}→${C_RESET} Dropping into interactive shell"
  exec docker run --rm -it \
    -v "$PKG_ROOT/$TGZ:/pkg/setup.tgz:ro" \
    -v "$SCRIPT_DIR/scenarios:/scenarios:ro" \
    "$IMAGE_TAG" \
    -c 'cd /home/tester && exec bash'
fi

scenario_path="$SCRIPT_DIR/scenarios/${scenario}.sh"
if [ ! -f "$scenario_path" ]; then
  echo "${C_RED}error:${C_RESET} no scenario at $scenario_path"
  echo "available scenarios:"
  ls "$SCRIPT_DIR/scenarios/" | sed 's/\.sh$//' | sed 's/^/  /'
  exit 2
fi

echo "${C_BOLD}@uluops/setup test:${C_RESET} $scenario"
echo "${C_DIM}→${C_RESET} Building image $IMAGE_TAG (cached if unchanged)"
# Build silently when cache hits; show output on changes so the user knows
# the slow apt/Node install is happening.
docker build -q -t "$IMAGE_TAG" "$SCRIPT_DIR" >/dev/null

echo "${C_DIM}→${C_RESET} npm run build"
cd "$PKG_ROOT"
npm run build >/dev/null

echo "${C_DIM}→${C_RESET} npm pack"
TGZ="$(npm pack --silent | tail -n1)"
# Always clean up the tarball, even on scenario failure
trap "rm -f '$PKG_ROOT/$TGZ'" EXIT

echo "${C_DIM}→${C_RESET} docker run --rm $scenario"
echo "${C_DIM}─────────────────────────────────────────${C_RESET}"
set +e
docker run --rm \
  -v "$PKG_ROOT/$TGZ:/pkg/setup.tgz:ro" \
  -v "$SCRIPT_DIR/scenarios:/scenarios:ro" \
  "$IMAGE_TAG" \
  "/scenarios/${scenario}.sh"
exit_code=$?
set -e
echo "${C_DIM}─────────────────────────────────────────${C_RESET}"

if [ $exit_code -eq 0 ]; then
  echo "${C_GREEN}✓${C_RESET} $scenario passed"
else
  echo "${C_RED}✗${C_RESET} $scenario failed (exit $exit_code)"
fi
exit $exit_code
