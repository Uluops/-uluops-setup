import { describe, it, expect } from "vitest";
import {
  resolveUninstallFilter,
  UninstallFilterError,
} from "../commands/uninstall-filter.js";

/**
 * Mirrors the install-side selectHarnesses test surface for symmetry —
 * the filter parser is the smallest testable unit of the subset-uninstall
 * feature; every CLI matrix row maps to a test here.
 */

function input(
  overrides: Partial<Parameters<typeof resolveUninstallFilter>[0]> = {},
) {
  return {
    harnessArg: undefined as string | undefined,
    harnessFromCli: false,
    allDetected: false,
    manifestHarnesses: ["claude-code", "codex"],
    ...overrides,
  };
}

describe("resolveUninstallFilter — defaults to full uninstall", () => {
  it("no --harness, no --all-detected → null (uninstall all)", () => {
    expect(resolveUninstallFilter(input())).toBeNull();
  });

  it("--harness with commander default value (harnessFromCli=false) → null", () => {
    // commander always populates opts.harness with the default; filter
    // must distinguish "user typed --harness X" from "X came from the
    // default" via the harnessFromCli flag.
    expect(
      resolveUninstallFilter(
        input({ harnessArg: "claude-code", harnessFromCli: false }),
      ),
    ).toBeNull();
  });
});

describe("resolveUninstallFilter — 'all' sentinel + --all-detected", () => {
  it("--harness all → null", () => {
    expect(
      resolveUninstallFilter(
        input({ harnessArg: "all", harnessFromCli: true }),
      ),
    ).toBeNull();
  });

  it("--all-detected → null", () => {
    expect(resolveUninstallFilter(input({ allDetected: true }))).toBeNull();
  });

  it("--harness all + --all-detected → null (equivalent)", () => {
    expect(
      resolveUninstallFilter(
        input({ harnessArg: "all", harnessFromCli: true, allDetected: true }),
      ),
    ).toBeNull();
  });
});

describe("resolveUninstallFilter — explicit subset", () => {
  it("single name → [name]", () => {
    expect(
      resolveUninstallFilter(
        input({ harnessArg: "codex", harnessFromCli: true }),
      ),
    ).toEqual(["codex"]);
  });

  it("comma-split subset → [a, b]", () => {
    expect(
      resolveUninstallFilter(
        input({
          harnessArg: "claude-code,codex",
          harnessFromCli: true,
          manifestHarnesses: ["claude-code", "codex", "opencode"],
        }),
      ),
    ).toEqual(["claude-code", "codex"]);
  });

  it("comma with whitespace → trimmed", () => {
    expect(
      resolveUninstallFilter(
        input({
          harnessArg: " claude-code , codex ",
          harnessFromCli: true,
          manifestHarnesses: ["claude-code", "codex"],
        }),
      ),
    ).toEqual(["claude-code", "codex"]);
  });
});

describe("resolveUninstallFilter — conflict detection", () => {
  it("--harness <name> + --all-detected → throws (matches install-side rule)", () => {
    expect(() =>
      resolveUninstallFilter(
        input({
          harnessArg: "codex",
          harnessFromCli: true,
          allDetected: true,
        }),
      ),
    ).toThrow(UninstallFilterError);
  });

  it("--harness <a,b> + --all-detected → throws", () => {
    expect(() =>
      resolveUninstallFilter(
        input({
          harnessArg: "claude-code,codex",
          harnessFromCli: true,
          allDetected: true,
        }),
      ),
    ).toThrow(/conflicts with --all-detected/);
  });
});

describe("resolveUninstallFilter — unknown harness validation", () => {
  it("--harness <typo> → throws naming the unknown name", () => {
    expect(() =>
      resolveUninstallFilter(
        input({
          harnessArg: "claude-coed",
          harnessFromCli: true,
          manifestHarnesses: ["claude-code", "codex"],
        }),
      ),
    ).toThrow(/claude-coed/);
  });

  it("--harness <known,unknown> → throws on first unknown (fail fast)", () => {
    expect(() =>
      resolveUninstallFilter(
        input({
          harnessArg: "claude-code,bogus",
          harnessFromCli: true,
          manifestHarnesses: ["claude-code", "codex"],
        }),
      ),
    ).toThrow(/bogus/);
  });

  it("error message lists what IS in the manifest so user can correct", () => {
    expect(() =>
      resolveUninstallFilter(
        input({
          harnessArg: "opencode",
          harnessFromCli: true,
          manifestHarnesses: ["claude-code", "codex"],
        }),
      ),
    ).toThrow(/Manifest contains: claude-code, codex/);
  });

  it("error message handles empty manifest gracefully", () => {
    expect(() =>
      resolveUninstallFilter(
        input({
          harnessArg: "claude-code",
          harnessFromCli: true,
          manifestHarnesses: [],
        }),
      ),
    ).toThrow(/Manifest contains: \(none\)/);
  });
});

describe("resolveUninstallFilter — edge cases", () => {
  it("empty --harness string → treated as no filter", () => {
    expect(
      resolveUninstallFilter(
        input({ harnessArg: "", harnessFromCli: true }),
      ),
    ).toBeNull();
  });

  it("--harness with only commas → treated as no filter (pathological)", () => {
    expect(
      resolveUninstallFilter(
        input({ harnessArg: ",,,", harnessFromCli: true }),
      ),
    ).toBeNull();
  });
});
