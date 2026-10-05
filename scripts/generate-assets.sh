#!/usr/bin/env bash
# generate-assets.sh — Pre-render assets for all harness formats.
#
# Uses `udl generate` (definition-factory-cli) to render YAML definitions
# into harness-specific formats. The definition factory is a build-time
# dependency only — never shipped in the npm package.
#
# Usage:
#   bash scripts/generate-assets.sh
#
# Requires:
#   - udl CLI installed globally (npm install -g @uluops/definition-factory-cli)
#   - uluops-agent-workflows repo at ../../uluops-agent-workflows (sibling dir)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PACKAGE_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ASSETS_DIR="$PACKAGE_ROOT/assets"
WORKFLOWS_REPO="$(cd "$PACKAGE_ROOT/../../uluops-agent-workflows" && pwd)"

ADL_DIR="$WORKFLOWS_REPO/udl/adl/v3"
CDL_DIR="$WORKFLOWS_REPO/udl/cdl/v1"
WDL_DIR="$WORKFLOWS_REPO/udl/wdl/v2"
PDL_DIR="$WORKFLOWS_REPO/udl/pdl/v1"

# Render from inside the corpus. `udl generate` resolves a command's invoked agent relative
# to the CURRENT DIRECTORY, and when it cannot find it, it silently drops the agent-derived
# sections (the Auto-Fail Conditions table among them) and still exits 0. Run from this
# package's directory, every starter command shipped without its auto-fail table until
# 2026-10-05 (found by the fidelity check below; the CLI's silent drop is tracked separately).
cd "$WORKFLOWS_REPO"

# --- Starter pack: agents that ship with setup ---
AGENTS=(
  anxiety-reader
  api-contract-validator
  aristotle-analyst
  aristotle-explorer
  aristotle-forecaster
  aristotle-validator
  assumption-excavator
  code-auditor
  code-optimizer
  code-validator
  docs-validator
  frontend-validator
  mcp-validator
  pre-implementation-architect
  prompt-engineer
  prompt-pattern-analyzer
  prompt-quality-validator
  public-interface-validator
  release-readiness
  security-analyst
  test-architect
  type-safety-validator
  workflow-synthesis
)

# --- Starter pack: agent commands (CDL) ---
AGENT_COMMANDS=(
  anxiety-reader
  api-contract
  architect
  aristotle-analyst
  aristotle-explorer
  aristotle-forecaster
  aristotle-validator
  assumption-excavator
  audit
  validate
  docs-validate
  frontend
  mcp-validate
  optimize
  pattern-analyzer
  prompt-quality
  prompt-validate
  public-interface
  release
  security
  test-review
  type-safety
  workflow-synthesis
)

# --- Starter pack: workflows (WDL) ---
WORKFLOWS=(post-implementation pre-implementation prompt-audit)

# --- Starter pack: pipelines (PDL) ---
PIPELINES=(aristotle-pipeline ship)

# --- Harness configurations ---
# Format: harness:model:agent_ext:has_commands
HARNESSES=(
  "claude-code::md:yes"
  "gemini-cli:gemini-3-flash-preview:md:yes"
  "opencode:openai/gpt-5:md:no"
  "codex:gpt-5.3:toml:no"
)

echo "Generating pre-rendered assets..."
echo "================================="

for entry in "${HARNESSES[@]}"; do
  IFS=: read -r harness model agent_ext has_commands <<< "$entry"
  echo ""
  echo "--- $harness ---"

  # Model flag (empty for claude-code which uses default)
  MODEL_FLAG=""
  if [[ -n "$model" ]]; then
    MODEL_FLAG="--model $model"
  fi

  # Target flag (empty for claude-code which is the default)
  TARGET_FLAG=""
  if [[ "$harness" != "claude-code" ]]; then
    TARGET_FLAG="--target $harness"
  fi

  # --- Agents ---
  agent_dir="$ASSETS_DIR/$harness/agents"
  mkdir -p "$agent_dir"
  # Clean old files
  rm -f "$agent_dir"/*

  agent_count=0
  for name in "${AGENTS[@]}"; do
    src="$ADL_DIR/$name.agent.yaml"
    if [[ ! -f "$src" ]]; then
      echo "  WARN: $src not found, skipping"
      continue
    fi
    # Output filename: name-agent.{ext}
    out="$agent_dir/$name-agent.$agent_ext"
    # --render-profile uluops-full is NOT optional: the default `core` profile silently
    # strips the failure-taxonomy reference, priority mapping, failure codes and tracker
    # frontmatter, and exits 0. Until 2026-10-05 this line omitted it, so every starter
    # agent setup shipped had no taxonomy table (workspace CLAUDE.md, "UDL CLI").
    udl generate "$src" -o "$out" $TARGET_FLAG $MODEL_FLAG --render-profile uluops-full --skip-validation
    agent_count=$((agent_count + 1))
  done
  echo "  agents: $agent_count"

  # --- Commands (only for harnesses that support them) ---
  if [[ "$has_commands" == "yes" ]]; then
    # Agent commands (CDL)
    cmd_agent_dir="$ASSETS_DIR/$harness/commands/agents"
    mkdir -p "$cmd_agent_dir"
    rm -f "$cmd_agent_dir"/*

    cmd_count=0
    for name in "${AGENT_COMMANDS[@]}"; do
      src="$CDL_DIR/$name.command.yaml"
      if [[ ! -f "$src" ]]; then
        echo "  WARN: CDL $src not found, skipping"
        continue
      fi
      if [[ "$harness" == "claude-code" ]]; then
        out="$cmd_agent_dir/$name.md"
      else
        out="$cmd_agent_dir/$name.toml"
      fi
      udl generate "$src" -o "$out" $TARGET_FLAG --skip-validation
      cmd_count=$((cmd_count + 1))
    done
    echo "  agent commands: $cmd_count"

    # Workflow commands (WDL)
    cmd_wf_dir="$ASSETS_DIR/$harness/commands/workflows"
    mkdir -p "$cmd_wf_dir"
    rm -f "$cmd_wf_dir"/*

    wf_count=0
    for name in "${WORKFLOWS[@]}"; do
      src="$WDL_DIR/$name.workflow.yaml"
      if [[ ! -f "$src" ]]; then
        echo "  WARN: WDL $src not found, skipping"
        continue
      fi
      if [[ "$harness" == "claude-code" ]]; then
        out="$cmd_wf_dir/$name.md"
      else
        out="$cmd_wf_dir/$name.toml"
      fi
      udl generate "$src" -o "$out" $TARGET_FLAG --skip-validation
      wf_count=$((wf_count + 1))
    done
    echo "  workflow commands: $wf_count"

    # Pipeline commands (PDL)
    cmd_pl_dir="$ASSETS_DIR/$harness/commands/pipelines"
    mkdir -p "$cmd_pl_dir"
    rm -f "$cmd_pl_dir"/*

    pl_count=0
    for name in "${PIPELINES[@]}"; do
      src="$PDL_DIR/$name.pipeline.yaml"
      if [[ ! -f "$src" ]]; then
        echo "  WARN: PDL $src not found, skipping"
        continue
      fi
      if [[ "$harness" == "claude-code" ]]; then
        out="$cmd_pl_dir/${name//-pipeline/}.md"
      else
        out="$cmd_pl_dir/${name//-pipeline/}.toml"
      fi
      udl generate "$src" -o "$out" $TARGET_FLAG --skip-validation
      pl_count=$((pl_count + 1))
    done
    echo "  pipeline commands: $pl_count"
  fi
done

# --- Fidelity check: claude-code assets must equal the committed corpus ---
# The claude-code renders use no --target and no --model, so each must be byte-identical
# to the file uluops-agent-workflows commits (rendered there at package.json#renderer.udl).
# A mismatch means a different renderer, a different profile, or a stale corpus — and
# shipping it would put a different prompt in users' hands than the one we validate.
echo ""
echo "--- fidelity check (claude-code vs corpus) ---"
mismatch=0
check() { if ! cmp -s "$1" "$2"; then echo "  MISMATCH: $1 vs $2"; mismatch=$((mismatch + 1)); fi; }
for name in "${AGENTS[@]}"; do check "$ASSETS_DIR/claude-code/agents/$name-agent.md" "$WORKFLOWS_REPO/agents/v3/$name-agent.md"; done
for name in "${AGENT_COMMANDS[@]}"; do check "$ASSETS_DIR/claude-code/commands/agents/$name.md" "$WORKFLOWS_REPO/commands/agents/$name.md"; done
for name in "${WORKFLOWS[@]}"; do check "$ASSETS_DIR/claude-code/commands/workflows/$name.md" "$WORKFLOWS_REPO/commands/workflows/$name.md"; done
for name in "${PIPELINES[@]}"; do check "$ASSETS_DIR/claude-code/commands/pipelines/${name//-pipeline/}.md" "$WORKFLOWS_REPO/commands/pipelines/$name.md"; done
if [[ $mismatch -gt 0 ]]; then
  echo "FAIL: $mismatch claude-code asset(s) differ from the corpus. Check udl --version against the corpus's package.json#renderer.udl, and the render profile."
  exit 1
fi
echo "  all claude-code assets match the corpus"

echo ""
echo "Done. Assets generated in $ASSETS_DIR/"
