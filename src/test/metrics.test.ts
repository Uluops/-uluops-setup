import { describe, it, expect, beforeEach, vi } from "vitest";
import { writeFile, readFile, mkdir, mkdtemp, access } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { readSettings, writeSettings, mergeUluopsHook, removeUluopsHook, hasUluopsHook } from "../lib/settings-merger.js";

let tmpDir: string;
let settingsPath: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "uluops-metrics-"));
  settingsPath = join(tmpDir, "settings.json");
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
        SomeOtherHook: [{ command: "echo hello" }],
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
        SomeOtherHook: [{ command: "echo hello" }],
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

  it("handles malformed settings gracefully", async () => {
    await writeFile(settingsPath, "broken json!!!");

    const settings = await readSettings(settingsPath);
    expect(settings).toEqual({});

    const merged = mergeUluopsHook(settings, "node ~/.claude/tools/agent-metrics/dist/hook.js");
    await writeSettings(settingsPath, merged);

    const result = JSON.parse(await readFile(settingsPath, "utf-8"));
    expect(hasUluopsHook(result)).toBe(true);
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
