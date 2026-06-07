import { describe, it, expect, vi } from "vitest";
import {
  selectHarnesses,
  parseHarnessArg,
  HarnessSelectionError,
} from "../cli/select-harnesses.js";
import type { HarnessProfile } from "../harnesses/index.js";

/**
 * Test fixtures — minimal HarnessProfile shape sufficient for the
 * selector. We only need `name` and `displayName` for selection logic;
 * the rest of the profile (paths, mcpConfig, etc.) is never read.
 */
function profile(name: string, displayName?: string): HarnessProfile {
  return {
    name,
    displayName: displayName ?? name,
  } as unknown as HarnessProfile;
}

const claudeCode = profile("claude-code", "Claude Code");
const codex = profile("codex", "Codex");
const opencode = profile("opencode", "OpenCode");
const geminiCli = profile("gemini-cli", "Gemini CLI");

/**
 * Build a default selection input with sensible test defaults that match
 * a fresh `npx @uluops/setup` invocation (no flags, no detection, TTY off,
 * inquirer not wired). Each test overrides what it cares about.
 */
function input(overrides: Partial<Parameters<typeof selectHarnesses>[0]> = {}) {
  return {
    harnessArg: "claude-code",
    harnessFromCli: false,
    allDetected: false,
    detected: [] as HarnessProfile[],
    defaultHarness: "claude-code",
    isInteractive: false,
    promptCheckbox: vi.fn(async () => [] as string[]),
    ...overrides,
  };
}

describe("parseHarnessArg", () => {
  it("returns 'all' sentinel for the literal 'all'", () => {
    expect(parseHarnessArg("all")).toBe("all");
  });

  it("returns 'all' sentinel even with whitespace around it", () => {
    expect(parseHarnessArg("  all  ")).toBe("all");
  });

  it("splits a comma-separated list and trims whitespace", () => {
    expect(parseHarnessArg("claude-code, codex ,gemini-cli")).toEqual([
      "claude-code",
      "codex",
      "gemini-cli",
    ]);
  });

  it("drops empty tokens (trailing comma, double comma)", () => {
    expect(parseHarnessArg("claude-code,,codex,")).toEqual([
      "claude-code",
      "codex",
    ]);
  });

  it("returns single-element array for a single name", () => {
    expect(parseHarnessArg("claude-code")).toEqual(["claude-code"]);
  });

  it("preserves aliases unchanged — alias resolution happens at getProfile, not parse", () => {
    expect(parseHarnessArg("claude,codex")).toEqual(["claude", "codex"]);
  });
});

describe("selectHarnesses — auto-detection (no explicit flags)", () => {
  it("falls back to defaultHarness when zero detected", async () => {
    const result = await selectHarnesses(input({ detected: [] }));
    expect(result).toEqual(["claude-code"]);
  });

  it("returns the single detected harness without prompting", async () => {
    const ck = vi.fn(async () => []);
    const result = await selectHarnesses(
      input({ detected: [codex], promptCheckbox: ck }),
    );
    expect(result).toEqual(["codex"]);
    expect(ck).not.toHaveBeenCalled();
  });

  it("emits info notice when single detected ≠ default harness", async () => {
    const emitted: string[] = [];
    await selectHarnesses(
      input({
        detected: [codex],
        emitInfo: (m) => emitted.push(m),
      }),
    );
    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toMatch(/Detected Codex/);
  });

  it("emits NO info notice when single detected IS default harness", async () => {
    const emitted: string[] = [];
    await selectHarnesses(
      input({
        detected: [claudeCode],
        emitInfo: (m) => emitted.push(m),
      }),
    );
    expect(emitted).toEqual([]);
  });

  it("prompts checkbox when multiple detected AND interactive", async () => {
    const ck = vi.fn(async () => ["claude-code", "codex"]);
    const result = await selectHarnesses(
      input({
        detected: [claudeCode, codex, geminiCli],
        isInteractive: true,
        promptCheckbox: ck,
      }),
    );
    expect(ck).toHaveBeenCalledWith([claudeCode, codex, geminiCli]);
    expect(result).toEqual(["claude-code", "codex"]);
  });

  it("returns user's empty selection from checkbox without coercing to default", async () => {
    // User unchecked everything — runSetup handles the empty case with a
    // "nothing to install" exit. The selector must NOT silently substitute
    // a default; that would override the user's deliberate "no" answer.
    const result = await selectHarnesses(
      input({
        detected: [claudeCode, codex],
        isInteractive: true,
        promptCheckbox: vi.fn(async () => []),
      }),
    );
    expect(result).toEqual([]);
  });

  it("non-interactive with multiple detected: first-detected + dimmed notice (spec §10.1)", async () => {
    const ck = vi.fn(async () => []);
    const emitted: string[] = [];
    const result = await selectHarnesses(
      input({
        detected: [claudeCode, codex, geminiCli],
        isInteractive: false,
        promptCheckbox: ck,
        emitInfo: (m) => emitted.push(m),
      }),
    );
    expect(result).toEqual(["claude-code"]);
    expect(ck).not.toHaveBeenCalled();
    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toMatch(/Multiple harnesses detected/);
    expect(emitted[0]).toMatch(/Codex/);
    expect(emitted[0]).toMatch(/Gemini CLI/);
    expect(emitted[0]).toMatch(/--all-detected to install into all/);
  });
});

describe("selectHarnesses — explicit --harness", () => {
  it("honors a single canonical name", async () => {
    const result = await selectHarnesses(
      input({
        harnessArg: "codex",
        harnessFromCli: true,
        detected: [claudeCode, codex, geminiCli],
      }),
    );
    expect(result).toEqual(["codex"]);
  });

  it("honors an alias (resolution happens at getProfile, not here)", async () => {
    const result = await selectHarnesses(
      input({
        harnessArg: "claude",
        harnessFromCli: true,
      }),
    );
    expect(result).toEqual(["claude"]);
  });

  it("honors a comma-separated subset", async () => {
    const result = await selectHarnesses(
      input({
        harnessArg: "claude-code,codex",
        harnessFromCli: true,
        detected: [claudeCode, codex, geminiCli],
      }),
    );
    expect(result).toEqual(["claude-code", "codex"]);
  });

  it("honors comma-separated aliases", async () => {
    const result = await selectHarnesses(
      input({
        harnessArg: "claude,oc",
        harnessFromCli: true,
      }),
    );
    expect(result).toEqual(["claude", "oc"]);
  });

  it("'--harness all' expands to all detected stable profiles", async () => {
    const result = await selectHarnesses(
      input({
        harnessArg: "all",
        harnessFromCli: true,
        detected: [claudeCode, opencode, codex],
      }),
    );
    expect(result).toEqual(["claude-code", "opencode", "codex"]);
  });

  it("'--harness all' falls back to default when nothing is detected", async () => {
    const result = await selectHarnesses(
      input({
        harnessArg: "all",
        harnessFromCli: true,
        detected: [],
      }),
    );
    expect(result).toEqual(["claude-code"]);
  });

  it("explicit --harness skips the checkbox prompt even when multi-detected + interactive", async () => {
    const ck = vi.fn(async () => []);
    const result = await selectHarnesses(
      input({
        harnessArg: "codex",
        harnessFromCli: true,
        detected: [claudeCode, codex, geminiCli],
        isInteractive: true,
        promptCheckbox: ck,
      }),
    );
    expect(result).toEqual(["codex"]);
    expect(ck).not.toHaveBeenCalled();
  });
});

describe("selectHarnesses — --all-detected flag", () => {
  it("expands to all detected stable profiles when zero detected → default fallback", async () => {
    const result = await selectHarnesses(
      input({ allDetected: true, detected: [] }),
    );
    expect(result).toEqual(["claude-code"]);
  });

  it("expands to all detected stable profiles", async () => {
    const result = await selectHarnesses(
      input({
        allDetected: true,
        detected: [claudeCode, opencode, geminiCli, codex],
      }),
    );
    expect(result).toEqual([
      "claude-code",
      "opencode",
      "gemini-cli",
      "codex",
    ]);
  });

  it("skips the checkbox prompt even when interactive", async () => {
    const ck = vi.fn(async () => []);
    const result = await selectHarnesses(
      input({
        allDetected: true,
        detected: [claudeCode, codex],
        isInteractive: true,
        promptCheckbox: ck,
      }),
    );
    expect(result).toEqual(["claude-code", "codex"]);
    expect(ck).not.toHaveBeenCalled();
  });

  it("--all-detected with --harness all is accepted (equivalent)", async () => {
    const result = await selectHarnesses(
      input({
        harnessArg: "all",
        harnessFromCli: true,
        allDetected: true,
        detected: [claudeCode, codex],
      }),
    );
    expect(result).toEqual(["claude-code", "codex"]);
  });

  it("--all-detected with --harness <single-name> THROWS HarnessSelectionError", async () => {
    await expect(() =>
      selectHarnesses(
        input({
          harnessArg: "codex",
          harnessFromCli: true,
          allDetected: true,
          detected: [claudeCode, codex],
        }),
      ),
    ).rejects.toThrow(HarnessSelectionError);
  });

  it("--all-detected with --harness <a,b> THROWS HarnessSelectionError", async () => {
    await expect(() =>
      selectHarnesses(
        input({
          harnessArg: "claude-code,codex",
          harnessFromCli: true,
          allDetected: true,
          detected: [claudeCode, codex],
        }),
      ),
    ).rejects.toThrow(/conflicts with --all-detected/);
  });
});
