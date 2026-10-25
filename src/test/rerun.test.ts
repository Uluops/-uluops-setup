import { describe, it, expect } from "vitest";
import { rerunCommand, rerunCommandsFor } from "../lib/rerun.js";

describe("rerunCommand", () => {
  it("carries a local install's scope flags", () => {
    expect(rerunCommand(["claude-code"], { mcpScope: "local", defsScope: "local" })).toBe(
      "npx @uluops/setup --harness claude-code --scope local --local-defs",
    );
  });

  it("adds no flags for a global install", () => {
    expect(rerunCommand(["codex"], { mcpScope: "global", defsScope: "global" })).toBe(
      "npx @uluops/setup --harness codex",
    );
  });

  it("keeps the two scopes independent", () => {
    expect(rerunCommand(["gemini-cli"], { mcpScope: "global", defsScope: "local" })).toBe(
      "npx @uluops/setup --harness gemini-cli --local-defs",
    );
  });
});

describe("rerunCommandsFor", () => {
  it("groups harnesses that share a scope and splits those that do not", () => {
    const cmds = rerunCommandsFor([
      ["claude-code", { mcpScope: "local", defsScope: "local" }],
      ["codex", { mcpScope: "global", defsScope: "global" }],
      ["gemini-cli", { mcpScope: "local", defsScope: "local" }],
    ]);
    expect(cmds).toEqual([
      "npx @uluops/setup --harness claude-code,gemini-cli --scope local --local-defs",
      "npx @uluops/setup --harness codex",
    ]);
  });
});
