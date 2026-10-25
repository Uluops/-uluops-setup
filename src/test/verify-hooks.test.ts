import { describe, it, expect, vi, beforeEach } from "vitest";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const bundled = vi.hoisted(() => ({ version: null as string | null }));
vi.mock("../steps/metrics.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../steps/metrics.js")>();
  return { ...original, bundledMetricsVersion: async () => bundled.version };
});

import { checkHooks } from "../steps/verify.js";
import type { HarnessManifest } from "../lib/manifest.js";

let toolsDir: string;

// A hook-capable profile whose settings check passes and whose tools dir is
// a temp tree, so the only variable is the three version numbers.
function profile() {
  return {
    displayName: "Claude Code",
    hooks: { check: async () => true },
    paths: { settingsPath: "/unused/settings.json", toolsDir },
  } as unknown as Parameters<typeof checkHooks>[0];
}

function entry(recorded: string): HarnessManifest {
  return { hooksInstalled: true, hooksInstalledVersion: recorded } as HarnessManifest;
}

beforeEach(async () => {
  toolsDir = await mkdtemp(join(tmpdir(), "uluops-hooks-"));
  await mkdir(join(toolsDir, "dist"), { recursive: true });
  await writeFile(join(toolsDir, "dist", "hook.js"), "");
  bundled.version = null;
});

async function installedAt(version: string): Promise<void> {
  await writeFile(join(toolsDir, "package.json"), JSON.stringify({ version }));
}

describe("checkHooks version conditions", () => {
  it("fails the row itself when the files changed outside setup", async () => {
    await installedAt("0.12.1");
    const checks: { label: string; passed: boolean; detail?: string }[] = [];

    const ok = await checkHooks(profile(), entry("0.12.0"), checks);

    expect(ok).toBe(false);
    expect(checks).toHaveLength(1);
    expect(checks[0]!.passed).toBe(false);
    expect(checks[0]!.detail).toBe(
      "v0.12.1 installed, manifest records v0.12.0 — changed outside setup; re-run setup",
    );
  });

  it("passes and names the update when this setup bundles a newer version", async () => {
    await installedAt("0.12.0");
    bundled.version = "0.12.1";
    const checks: { label: string; passed: boolean; detail?: string }[] = [];

    const ok = await checkHooks(profile(), entry("0.12.0"), checks);

    expect(ok).toBe(true);
    expect(checks[0]!.passed).toBe(true);
    expect(checks[0]!.detail).toBe("v0.12.0 — this setup bundles v0.12.1; re-run setup to update");
  });

  it("passes with the bare version when installed, recorded and bundled agree", async () => {
    await installedAt("0.12.1");
    bundled.version = "0.12.1";
    const checks: { label: string; passed: boolean; detail?: string }[] = [];

    expect(await checkHooks(profile(), entry("0.12.1"), checks)).toBe(true);
    expect(checks[0]!.detail).toBe("v0.12.1");
  });
});
