/**
 * Per-harness orchestration types + the exit-code classifier.
 *
 * Lives in its own module so both `runSetup` (which produces these) and
 * `printSetupSummary` (which renders them) can import without circular
 * dependency. The classifier is testable in isolation — every row of the
 * spec §7.5 4-tier table is one test.
 */

import type { HarnessProfile } from "../harnesses/index.js";
import type { PartialStep } from "../lib/manifest.js";
import type { AgentsResult } from "../steps/agents.js";
import type { CommandsResult } from "../steps/commands.js";
import type { SkillsResult } from "../steps/skills.js";
import type { MetricsResult } from "../steps/metrics.js";
import type { McpResult } from "../steps/mcp.js";

/**
 * Per-harness outcome captured by the orchestrator loop.
 *
 * `status` semantics:
 *   ok        — every per-harness step succeeded; the user's choice was
 *               carried out and recorded in the manifest.
 *   failed    — an OPERATIONAL error occurred (MCP write failed,
 *               agents-step mkdir EACCES, etc.). Drives exit code 1.
 *   declined  — the user actively rejected the conflict prompt. NOT an
 *               error from the tool's perspective — it's a deliberate
 *               choice. Drives exit code 0 (with a non-zero summary line
 *               surfacing the count).
 */
export interface PerHarnessResult {
  harnessName: string;
  profile: HarnessProfile;
  status: "ok" | "failed" | "declined";
  error?: string;
  mcpResult?: McpResult;
  agentsResult?: AgentsResult;
  commandsResult?: CommandsResult;
  skillsResult?: SkillsResult;
  metricsResult?: MetricsResult;
  partial?: PartialStep | null;
}

/**
 * Decide the process exit code from a set of per-harness results.
 *
 * Spec §7.5 4-tier table:
 *
 *   | Outcome                                              | Exit |
 *   |------------------------------------------------------|------|
 *   | Every harness ok                                     |  0   |
 *   | Any harness failed (operational)                     |  1   |
 *   | Any declined AND zero failed                         |  0   |
 *   | Empty (user unchecked all, or no harnesses to run)   |  0   |
 *
 * Rationale: CI wrapping `--harness all` should not be poisoned by
 * user-policy choices (declines, no-op outcomes) but MUST fail on
 * operational errors (EACCES, ENOSPC, parse-error) so deploy pipelines
 * can detect partial failure and re-run.
 *
 * `partial` is a property of a `failed` result (post-MCP-success step
 * threw), not its own status — it's already covered by the failed
 * branch. A successful run with file-level `failures[]` arrays is
 * still `status: "ok"` (file failures are recoverable on re-run; the
 * user has working state).
 */
export function classifyExit(results: PerHarnessResult[]): number {
  if (results.length === 0) return 0;
  const anyFailed = results.some((r) => r.status === "failed");
  return anyFailed ? 1 : 0;
}
