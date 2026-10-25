import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../steps/verify.js");
vi.mock("../lib/version.js", () => ({ getVersion: async () => "9.9.9" }));

import { runVerify } from "../commands/verify.js";
import { verify } from "../steps/verify.js";

const mockVerify = vi.mocked(verify);

// chalk strips colour when stdout is not a TTY, but strip escapes anyway so
// the assertions read the text a user sees.
function printedLines(spy: { mock: { calls: unknown[][] } }): string[] {
  return spy.mock.calls.map((c: unknown[]) =>
    // eslint-disable-next-line no-control-regex
    String(c[0] ?? "").replace(/\u001b\[[0-9;]*m/g, ""),
  );
}

let logSpy: { mock: { calls: unknown[][] } };

beforeEach(() => {
  logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("runVerify rendering", () => {
  it("prints a passed row's detail, so a run-failing row cannot hide behind a tick", async () => {
    mockVerify.mockResolvedValue({
      ok: false,
      checks: [
        { label: "[Claude Code] Metrics hook", passed: true, detail: "drift: manifest 1.0.0, installed 1.1.0" },
      ],
      fixCommands: [],
    });

    await runVerify();

    const lines = printedLines(logSpy);
    expect(lines).toContain("  ✓ [Claude Code] Metrics hook — drift: manifest 1.0.0, installed 1.1.0");
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  it("prints a skipped row with a warning glyph and does not fail the run", async () => {
    mockVerify.mockResolvedValue({
      ok: true,
      checks: [
        {
          label: "API key check skipped",
          passed: true,
          skipped: true,
          detail: "no key in ULUOPS_API_KEY or ~/.uluops/credentials.json",
        },
      ],
      fixCommands: [],
    });

    await runVerify();

    const lines = printedLines(logSpy);
    expect(lines).toContain(
      "  ⚠ API key check skipped — no key in ULUOPS_API_KEY or ~/.uluops/credentials.json",
    );
    expect(lines.some((l) => l.startsWith("  ✓ API key"))).toBe(false);
    expect(process.exit).toHaveBeenCalledWith(0);
  });

  it("ends a failed run with re-run commands that keep each harness's recorded scope", async () => {
    mockVerify.mockResolvedValue({
      ok: false,
      checks: [{ label: "[Codex] Agent files", passed: false, detail: "Missing 2 agent(s)" }],
      fixCommands: [
        "npx @uluops/setup --harness claude-code --scope local --local-defs",
        "npx @uluops/setup --harness codex",
      ],
    });

    await runVerify();

    const lines = printedLines(logSpy);
    expect(lines).toContain("  To fix, re-run (harnesses installed with different flags):");
    expect(lines).toContain("    npx @uluops/setup --harness claude-code --scope local --local-defs");
    expect(lines).toContain("    npx @uluops/setup --harness codex");
    expect(lines.some((l) => l.includes("Run npx @uluops/setup to fix"))).toBe(false);
  });
});
