import { describe, it, expect } from "vitest";
import { classifyExit } from "../commands/per-harness.js";
import type { PerHarnessResult } from "../commands/per-harness.js";
import type { HarnessProfile } from "../harnesses/index.js";

/**
 * Spec §7.5 4-tier exit-code classifier. Each row of the table gets its
 * own test so a regression on any single row fails loud and the failing
 * row is named in the test output.
 */

function r(
  status: PerHarnessResult["status"],
  overrides: Partial<PerHarnessResult> = {},
): PerHarnessResult {
  return {
    harnessName: "claude-code",
    profile: { name: "claude-code", displayName: "Claude Code" } as unknown as HarnessProfile,
    status,
    ...overrides,
  };
}

describe("classifyExit", () => {
  it("empty list → 0 (nothing to install — user-chosen outcome)", () => {
    expect(classifyExit([])).toBe(0);
  });

  it("single ok → 0", () => {
    expect(classifyExit([r("ok")])).toBe(0);
  });

  it("all ok across many → 0", () => {
    expect(classifyExit([r("ok"), r("ok"), r("ok")])).toBe(0);
  });

  it("single failed → 1", () => {
    expect(classifyExit([r("failed", { error: "EACCES" })])).toBe(1);
  });

  it("any failed among many → 1 (one bad apple)", () => {
    expect(classifyExit([r("ok"), r("ok"), r("failed", { error: "EACCES" })])).toBe(1);
  });

  it("single declined → 0 (user choice, not error)", () => {
    expect(classifyExit([r("declined")])).toBe(0);
  });

  it("multiple declined, zero failed → 0 (every user choice respected)", () => {
    expect(classifyExit([r("declined"), r("declined")])).toBe(0);
  });

  it("declined + ok → 0 (mixed user choices, none operational)", () => {
    expect(classifyExit([r("declined"), r("ok"), r("declined")])).toBe(0);
  });

  it("declined + failed → 1 (operational failure trumps user choice)", () => {
    // CI must see the failure signal even when one harness was also
    // declined — failed is the actionable signal, declined isn't.
    expect(classifyExit([r("declined"), r("failed", { error: "ENOSPC" })])).toBe(1);
  });

  it("partial entry (failed with partial step) still drives exit 1", () => {
    // 'partial' is a property of a failed result, not its own status —
    // post-MCP-success step throw produces a partial manifest entry but
    // the exit code rule still treats it as a failure.
    expect(
      classifyExit([r("failed", { error: "agents step EACCES", partial: "agents" })]),
    ).toBe(1);
  });
});
