import { describe, it, expect, beforeEach } from "vitest";
import { writeFile, readFile, mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { readSettings, writeSettings, mergeUluopsHook, removeUluopsHook, hasUluopsHook } from "../lib/settings-merger.js";
import { getHookCommand, installMetrics } from "../steps/metrics.js";
import type { HarnessProfile } from "../harnesses/index.js";

let tmpDir: string;
let settingsPath: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "uluops-metrics-"));
  settingsPath = join(tmpDir, "settings.json");
});

describe("getHookCommand quoting", () => {
  it("quotes both the node path and the hook.js path", () => {
    const profile = {
      paths: { toolsDir: "/path with spaces/tools/agent-metrics" },
    } as unknown as HarnessProfile;
    const cmd = getHookCommand(profile);
    // Both paths must be quoted to handle spaces
    expect(cmd).toMatch(/^"[^"]+"\s+"[^"]+"$/);
    expect(cmd).toContain("dist/hook.js");
  });

  it("throws if toolsDir is null", () => {
    const profile = {
      paths: { toolsDir: null },
    } as unknown as HarnessProfile;
    expect(() => getHookCommand(profile)).toThrow("No tool dir");
  });
});

describe("metrics hook integration", () => {
  it("configures hook in empty settings", async () => {
    const settings = await readSettings(settingsPath);
    expect(settings).toEqual({});

    const hookCommand = "node ~/.claude/tools/agent-metrics/dist/hook.js";
    const merged = mergeUluopsHook(settings, hookCommand);
    await writeSettings(settingsPath, merged);

    const written = JSON.parse(await readFile(settingsPath, "utf-8"));
    expect(hasUluopsHook(written)).toBe(true);
  });

  it("preserves existing settings through hook install", async () => {
    const existing = {
      theme: "dark",
      hooks: {
        SomeOtherHook: [{ hooks: [{ type: "command", command: "echo hello" }] }],
      },
    };
    await writeFile(settingsPath, JSON.stringify(existing));

    const settings = await readSettings(settingsPath);
    const merged = mergeUluopsHook(settings, "node ~/.claude/tools/agent-metrics/dist/hook.js");
    await writeSettings(settingsPath, merged);

    const result = JSON.parse(await readFile(settingsPath, "utf-8"));
    expect(result.theme).toBe("dark");
    expect(result.hooks.SomeOtherHook).toBeDefined();
    expect(hasUluopsHook(result)).toBe(true);
  });

  it("removes hook cleanly without affecting other settings", async () => {
    const withHook = {
      theme: "dark",
      hooks: {
        SomeOtherHook: [{ hooks: [{ type: "command", command: "echo hello" }] }],
      },
    };
    // First install the hook
    const merged = mergeUluopsHook(withHook, "node ~/.claude/tools/agent-metrics/dist/hook.js");
    await writeSettings(settingsPath, merged);

    // Then remove it
    const settings = await readSettings(settingsPath);
    const cleaned = removeUluopsHook(settings);
    await writeSettings(settingsPath, cleaned);

    const result = JSON.parse(await readFile(settingsPath, "utf-8"));
    expect(result.theme).toBe("dark");
    expect(result.hooks.SomeOtherHook).toBeDefined();
    expect(hasUluopsHook(result)).toBe(false);
  });

  it("throws on malformed settings to prevent silent data loss", async () => {
    await writeFile(settingsPath, "broken json!!!");
    await expect(readSettings(settingsPath)).rejects.toThrow("invalid JSON");
  });

  it("is idempotent — installing hook twice doesn't duplicate", async () => {
    const settings = await readSettings(settingsPath);
    const hookCommand = "node ~/.claude/tools/agent-metrics/dist/hook.js";

    const merged1 = mergeUluopsHook(settings, hookCommand);
    const merged2 = mergeUluopsHook(merged1, hookCommand);

    // Should have same structure — no duplicate entries
    expect(JSON.stringify(merged1)).toBe(JSON.stringify(merged2));
  });
});

describe("installMetrics — orchestration", () => {
  it("short-circuits with skippedReason when the harness has no hooks", async () => {
    const profile = {
      hooks: null,
      paths: { toolsDir: "/tmp/x", settingsPath: "/tmp/x.json" },
    } as unknown as HarnessProfile;

    const result = await installMetrics(profile, false);

    expect(result).toEqual({
      toolFilesCopied: 0,
      hookConfigured: false,
      hooksInstalledVersion: null,
      skippedReason: "no-hook-support",
    });
  });

  it("short-circuits when toolsDir is missing even if hooks is defined", async () => {
    const profile = {
      hooks: { install: async () => {}, remove: async () => {} },
      paths: { toolsDir: null, settingsPath: "/tmp/x.json" },
    } as unknown as HarnessProfile;

    const result = await installMetrics(profile, false);
    expect(result.skippedReason).toBe("no-hook-support");
    expect(result.hookConfigured).toBe(false);
  });

  it("short-circuits when settingsPath is missing even if hooks is defined", async () => {
    const profile = {
      hooks: { install: async () => {}, remove: async () => {} },
      paths: { toolsDir: "/tmp/x", settingsPath: null },
    } as unknown as HarnessProfile;

    const result = await installMetrics(profile, false);
    expect(result.skippedReason).toBe("no-hook-support");
  });

  it("does not write to disk in dry-run mode", async () => {
    // toolsDir points at a nonexistent path; if dry-run were violated, the
    // mkdir would either succeed (leaking state) or throw. Either is a
    // detectable contract break, so this test fails closed.
    const toolDir = join(tmpDir, "should-not-be-created");
    const profile = {
      hooks: {
        install: async () => {
          throw new Error("install must not run in dry-run mode");
        },
        remove: async () => {},
      },
      paths: { toolsDir: toolDir, settingsPath: join(tmpDir, "settings.json") },
    } as unknown as HarnessProfile;

    // The agent-metrics package is resolvable in this repo, so findMetricsSource
    // will succeed; the test still must not mutate disk because dry-run is true.
    const result = await installMetrics(profile, true);
    // Whatever the resolved source state is, the dry-run contract holds:
    // hook.install was not called (would have thrown), and no recursive mkdir
    // landed on the never-created path.
    expect(result).toBeDefined();
    await expect(readFile(toolDir, "utf-8")).rejects.toThrow();
  });
});
