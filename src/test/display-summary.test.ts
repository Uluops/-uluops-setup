import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { printSetupSummary, maskKey } from "../lib/display.js";
import type { PerHarnessResult } from "../commands/per-harness.js";
import type { HarnessProfile } from "../harnesses/index.js";

/**
 * Capture console.log into a buffer and strip ANSI color codes so
 * assertions can match plain substrings. printSetupSummary is the
 * primary user-facing rendering surface for multi-harness runs; every
 * status icon, every re-run hint, and the header line are all
 * regression-sensitive.
 */
const ANSI = /\x1B\[[0-9;]*m/g;
let captured: string[] = [];
let originalLog: typeof console.log;

beforeEach(() => {
  captured = [];
  originalLog = console.log;
  console.log = (...args: unknown[]) => {
    captured.push(args.map((a) => String(a).replace(ANSI, "")).join(" "));
  };
});

afterEach(() => {
  console.log = originalLog;
  vi.restoreAllMocks();
});

function output(): string {
  return captured.join("\n");
}

function profile(name: string, displayName: string, hooks = false): HarnessProfile {
  return { name, displayName, hooks } as unknown as HarnessProfile;
}

function okResult(
  name: string,
  displayName: string,
  counts: { agents?: number; commands?: number; skills?: number; metrics?: boolean } = {},
): PerHarnessResult {
  return {
    harnessName: name,
    profile: profile(name, displayName, !!counts.metrics),
    status: "ok",
    agentsResult: counts.agents !== undefined
      ? ({ files: new Array(counts.agents).fill("x") } as unknown as PerHarnessResult["agentsResult"])
      : undefined,
    commandsResult: counts.commands !== undefined
      ? ({ files: new Array(counts.commands).fill("x") } as unknown as PerHarnessResult["commandsResult"])
      : undefined,
    skillsResult: counts.skills !== undefined
      ? ({ files: new Array(counts.skills).fill("x") } as unknown as PerHarnessResult["skillsResult"])
      : undefined,
    metricsResult: counts.metrics
      ? ({ hookConfigured: true } as unknown as PerHarnessResult["metricsResult"])
      : undefined,
  };
}

function failedResult(
  name: string,
  displayName: string,
  error: string,
  partial?: PerHarnessResult["partial"],
): PerHarnessResult {
  return {
    harnessName: name,
    profile: profile(name, displayName),
    status: "failed",
    error,
    partial,
  };
}

function declinedResult(name: string, displayName: string): PerHarnessResult {
  return {
    harnessName: name,
    profile: profile(name, displayName),
    status: "declined",
    error: "user declined",
  };
}

describe("printSetupSummary — empty input", () => {
  it("no-ops when results is empty (runSetup short-circuits before calling)", async () => {
    await printSetupSummary({ results: [], apiKey: "ulr_test_xxxxxxxxx" });
    expect(captured).toEqual([]);
  });
});

describe("printSetupSummary — single-harness ok (regression baseline)", () => {
  it("prints today's 'Setup complete!' banner shape for a single ok harness", async () => {
    // Single-harness single-result must NOT use the multi-harness section
    // block; today's UX is the regression baseline for 99% of users.
    // Skip the claude-code branch so we don't trigger the agent-catalog
    // I/O (printAgentList reads the asset directory).
    await printSetupSummary({
      results: [okResult("opencode", "OpenCode", { agents: 23 })],
      apiKey: "ulr_test_xxxxxxxxx",
    });
    const out = output();
    expect(out).toContain("Setup complete!");
    expect(out).toContain("(OpenCode)");
    expect(out).toContain("23 agents");
    // Single-harness should NOT emit per-harness section labels like "[OpenCode] installed"
    expect(out).not.toMatch(/\[OpenCode\] installed/);
    // API key reminder (masked — maskKey preserves the last 4 chars)
    expect(out).toMatch(/\*{4,}xxxx/);
    expect(out).toContain("ULUOPS_API_KEY");
    // Restart instruction
    expect(out).toMatch(/Restart OpenCode/);
  });
});

describe("printSetupSummary — single-harness declined", () => {
  it("prints 'Setup skipped' header, no restart line", async () => {
    await printSetupSummary({
      results: [declinedResult("opencode", "OpenCode")],
      apiKey: "ulr_test_xxxxxxxxx",
    });
    const out = output();
    expect(out).toContain("Setup skipped");
    expect(out).toContain("(OpenCode)");
    expect(out).toContain("declined the conflict prompt");
    // Nothing installed → no restart instruction
    expect(out).not.toMatch(/Restart/);
  });
});

describe("printSetupSummary — single-harness failed", () => {
  it("prints 'Setup failed' header with error message", async () => {
    await printSetupSummary({
      results: [failedResult("opencode", "OpenCode", "EACCES on opencode.json")],
      apiKey: "ulr_test_xxxxxxxxx",
    });
    const out = output();
    expect(out).toContain("Setup failed");
    expect(out).toContain("(OpenCode)");
    expect(out).toContain("EACCES on opencode.json");
    expect(out).not.toMatch(/Restart/);
  });
});

describe("printSetupSummary — multi-harness all ok", () => {
  it("prints aggregate header + per-harness ok lines + combined restart instruction", async () => {
    await printSetupSummary({
      results: [
        okResult("opencode", "OpenCode", { agents: 23 }),
        okResult("codex", "Codex", { agents: 23, skills: 1 }),
      ],
      apiKey: "ulr_test_xxxxxxxxx",
    });
    const out = output();
    expect(out).toContain("Setup complete:");
    expect(out).toContain("2 installed");
    expect(out).toContain("of 2 harnesses");
    expect(out).toMatch(/\[OpenCode\] installed/);
    expect(out).toMatch(/\[Codex\] installed/);
    expect(out).toContain("23 agents");
    expect(out).toContain("1 skills");
    // Restart line lists BOTH
    expect(out).toMatch(/Restart each of OpenCode, Codex to load agents/);
  });
});

describe("printSetupSummary — multi-harness mixed (ok + failed + declined)", () => {
  it("prints 'Setup finished:' header (not 'complete') with per-status counts", async () => {
    await printSetupSummary({
      results: [
        okResult("claude-code", "Claude Code", { agents: 23, commands: 28, metrics: true }),
        failedResult("opencode", "OpenCode", "EACCES", undefined),
        declinedResult("codex", "Codex"),
      ],
      apiKey: "ulr_test_xxxxxxxxx",
    });
    const out = output();
    expect(out).toContain("Setup finished:");
    expect(out).toContain("1 installed");
    expect(out).toContain("1 failed");
    expect(out).toContain("1 declined");
    expect(out).toContain("of 3 harnesses");
    // Per-harness lines
    expect(out).toMatch(/\[Claude Code\] installed/);
    expect(out).toMatch(/\[OpenCode\] failed — EACCES/);
    expect(out).toMatch(/\[Codex\] skipped — user declined conflict prompt/);
    // Re-run hints attach to failed entries
    expect(out).toMatch(/Re-run: npx @uluops\/setup --harness opencode/);
    // Restart instruction lists only the ok harness
    expect(out).toMatch(/Restart Claude Code/);
    expect(out).not.toMatch(/Restart .*OpenCode/);
  });
});

describe("printSetupSummary — multi-harness with partial entry", () => {
  it("renders partial with 'failed at \"<step>\"' wording + re-run hint", async () => {
    await printSetupSummary({
      results: [
        okResult("claude-code", "Claude Code", { agents: 23 }),
        failedResult("opencode", "OpenCode", "mkdir: EACCES", "agents"),
      ],
      apiKey: "ulr_test_xxxxxxxxx",
    });
    const out = output();
    expect(out).toMatch(/\[OpenCode\] partial — failed at "agents": mkdir: EACCES/);
    expect(out).toMatch(/Re-run: npx @uluops\/setup --harness opencode/);
  });
});

describe("printSetupSummary — multi-harness all declined", () => {
  it("'0 installed, 2 declined of 2' header, no restart line at all", async () => {
    await printSetupSummary({
      results: [
        declinedResult("claude-code", "Claude Code"),
        declinedResult("codex", "Codex"),
      ],
      apiKey: "ulr_test_xxxxxxxxx",
    });
    const out = output();
    expect(out).toContain("Setup finished:");
    expect(out).toContain("0 installed");
    expect(out).toContain("2 declined");
    expect(out).not.toMatch(/Restart/);
  });
});

describe("maskKey", () => {
  it("masks all but the last 4 characters of a typical API key", () => {
    expect(maskKey("ulr_1234567890abcd")).toMatch(/^\*+abcd$/);
  });

  it("returns '****' for empty or sub-5-character input", () => {
    expect(maskKey("")).toBe("****");
    expect(maskKey("abcd")).toBe("****");
  });
});
