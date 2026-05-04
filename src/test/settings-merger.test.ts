import { describe, it, expect, afterEach, vi } from "vitest";
import {
  mergeUluopsHook,
  removeUluopsHook,
  hasUluopsHook,
  probeHookSupport,
} from "../lib/settings-merger.js";

describe("settings-merger", () => {
  describe("mergeUluopsHook", () => {
    it("should add hook to empty settings", () => {
      const result = mergeUluopsHook({}, "node ~/.claude/tools/agent-metrics/dist/hook.js");
      expect(result.hooks).toBeDefined();
      expect(result.hooks!["SubagentStop"]).toHaveLength(1);
      expect(result.hooks!["SubagentStop"]![0]!.hooks[0]!.command).toContain(
        "tools/agent-metrics",
      );
      expect(result.hooks!["SubagentStop"]![0]!.hooks[0]!.timeout).toBe(30);
    });

    it("should preserve existing permissions", () => {
      const settings = {
        permissions: { allow: ["Bash(curl:*)"] },
      };
      const result = mergeUluopsHook(
        settings,
        "node ~/.claude/tools/agent-metrics/dist/hook.js",
      );
      expect(result.permissions).toEqual({ allow: ["Bash(curl:*)"] });
      expect(result.hooks!["SubagentStop"]).toHaveLength(1);
    });

    it("should preserve non-UluOps hooks", () => {
      const settings = {
        hooks: {
          SubagentStop: [
            {
              hooks: [
                { type: "command", command: "echo custom-hook" },
              ],
            },
          ],
        },
      };
      const result = mergeUluopsHook(
        settings,
        "node ~/.claude/tools/agent-metrics/dist/hook.js",
      );
      // Should have both: custom + UluOps
      expect(result.hooks!["SubagentStop"]).toHaveLength(2);
      expect(result.hooks!["SubagentStop"]![0]!.hooks[0]!.command).toBe(
        "echo custom-hook",
      );
      expect(result.hooks!["SubagentStop"]![1]!.hooks[0]!.command).toContain(
        "tools/agent-metrics",
      );
    });

    it("should replace existing UluOps hook on re-run", () => {
      const settings = {
        hooks: {
          SubagentStop: [
            {
              hooks: [
                {
                  type: "command",
                  command: "node /old/path/tools/agent-metrics/dist/hook.js",
                },
              ],
            },
          ],
        },
      };
      const result = mergeUluopsHook(
        settings,
        "node ~/.claude/tools/agent-metrics/dist/hook.js",
      );
      // Should replace, not duplicate
      expect(result.hooks!["SubagentStop"]).toHaveLength(1);
      expect(result.hooks!["SubagentStop"]![0]!.hooks[0]!.command).toContain(
        "~/.claude/tools/agent-metrics",
      );
    });

    it("should preserve other hook event types", () => {
      const settings = {
        hooks: {
          PreToolUse: [{ hooks: [{ type: "command", command: "echo pre" }] }],
        },
      };
      const result = mergeUluopsHook(
        settings,
        "node ~/.claude/tools/agent-metrics/dist/hook.js",
      );
      expect(result.hooks!["PreToolUse"]).toHaveLength(1);
      expect(result.hooks!["SubagentStop"]).toHaveLength(1);
    });
  });

  describe("removeUluopsHook", () => {
    it("should remove UluOps hook and preserve permissions", () => {
      const settings = {
        permissions: { allow: ["Bash(curl:*)"] },
        hooks: {
          SubagentStop: [
            {
              hooks: [
                {
                  type: "command",
                  command: "node ~/.claude/tools/agent-metrics/dist/hook.js",
                  timeout: 30,
                },
              ],
            },
          ],
        },
      };
      const result = removeUluopsHook(settings);
      expect(result.permissions).toEqual({ allow: ["Bash(curl:*)"] });
      expect(result.hooks).toBeUndefined();
    });

    it("should preserve non-UluOps hooks", () => {
      const settings = {
        hooks: {
          SubagentStop: [
            { hooks: [{ type: "command", command: "echo custom" }] },
            {
              hooks: [
                {
                  type: "command",
                  command: "node ~/.claude/tools/agent-metrics/dist/hook.js",
                },
              ],
            },
          ],
        },
      };
      const result = removeUluopsHook(settings);
      expect(result.hooks!["SubagentStop"]).toHaveLength(1);
      expect(result.hooks!["SubagentStop"]![0]!.hooks[0]!.command).toBe(
        "echo custom",
      );
    });

    it("should handle settings with no hooks", () => {
      const settings = { permissions: { allow: [] } };
      const result = removeUluopsHook(settings);
      expect(result).toEqual({ permissions: { allow: [] } });
    });

    it("should clean up empty hooks object", () => {
      const settings = {
        hooks: {
          SubagentStop: [
            {
              hooks: [
                {
                  type: "command",
                  command: "node /some/tools/agent-metrics/hook.js",
                },
              ],
            },
          ],
        },
      };
      const result = removeUluopsHook(settings);
      expect(result.hooks).toBeUndefined();
    });
  });

  describe("hasUluopsHook", () => {
    it("should return true when UluOps hook is present", () => {
      const settings = {
        hooks: {
          SubagentStop: [
            {
              hooks: [
                {
                  type: "command",
                  command: "node ~/.claude/tools/agent-metrics/dist/hook.js",
                },
              ],
            },
          ],
        },
      };
      expect(hasUluopsHook(settings)).toBe(true);
    });

    it("should return false when no hooks exist", () => {
      expect(hasUluopsHook({})).toBe(false);
    });

    it("should return false when only non-UluOps hooks exist", () => {
      const settings = {
        hooks: {
          SubagentStop: [
            { hooks: [{ type: "command", command: "echo custom" }] },
          ],
        },
      };
      expect(hasUluopsHook(settings)).toBe(false);
    });
  });
});

describe("probeHookSupport", () => {
  afterEach(() => {
    delete process.env["ULUOPS_HOOK_TYPE"];
  });

  it("returns supported for default SubagentStop", () => {
    const result = probeHookSupport();
    expect(result.hookType).toBe("SubagentStop");
    expect(result.supported).toBe(true);
    expect(result.warning).toBeUndefined();
  });

  it("returns supported for known hook types", () => {
    for (const t of ["PreToolUse", "PostToolUse", "Notification", "Stop"]) {
      process.env["ULUOPS_HOOK_TYPE"] = t;
      const result = probeHookSupport();
      expect(result.hookType).toBe(t);
      expect(result.supported).toBe(true);
    }
  });

  it("returns unsupported with warning for unknown hook type", () => {
    process.env["ULUOPS_HOOK_TYPE"] = "FakeHook";
    const result = probeHookSupport();
    expect(result.hookType).toBe("FakeHook");
    expect(result.supported).toBe(false);
    expect(result.warning).toContain("FakeHook");
  });
});
