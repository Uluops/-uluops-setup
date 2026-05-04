import { describe, it, expect, beforeEach } from "vitest";
import { writeFile, mkdir, mkdtemp, readdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { uninstallAgents } from "../steps/agents.js";
import { syncAssets } from "../lib/file-ops.js";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "uluops-agents-"));
});

describe("uninstallAgents", () => {
  it("removes listed agent files from directory", async () => {
    const agentsDir = join(tmpDir, "agents");
    await mkdir(agentsDir, { recursive: true });
    await writeFile(join(agentsDir, "code-validator-agent.md"), "content");
    await writeFile(join(agentsDir, "test-architect-agent.md"), "content");
    await writeFile(join(agentsDir, "custom-agent.md"), "custom");

    const removed = await uninstallAgents(
      ["code-validator-agent.md", "test-architect-agent.md"],
      tmpDir,
    );

    expect(removed).toBe(2);
    const remaining = await readdir(agentsDir);
    expect(remaining).toEqual(["custom-agent.md"]);
  });

  it("returns 0 when files are already gone", async () => {
    const agentsDir = join(tmpDir, "agents");
    await mkdir(agentsDir, { recursive: true });

    const removed = await uninstallAgents(
      ["nonexistent-agent.md"],
      tmpDir,
    );

    expect(removed).toBe(0);
  });

  it("handles empty file list", async () => {
    const agentsDir = join(tmpDir, "agents");
    await mkdir(agentsDir, { recursive: true });
    await writeFile(join(agentsDir, "agent.md"), "content");

    const removed = await uninstallAgents([], tmpDir);

    expect(removed).toBe(0);
    const remaining = await readdir(agentsDir);
    expect(remaining).toEqual(["agent.md"]);
  });
});

describe("installAgents (via syncAssets)", () => {
  // installAgents is a thin wrapper that resolves paths then calls syncAssets.
  // We test the core behavior directly via syncAssets to avoid fs mock complexity.

  it("copies new agent files from source to destination", async () => {
    const srcDir = join(tmpDir, "src-agents");
    const destDir = join(tmpDir, "dest-agents");
    await mkdir(srcDir, { recursive: true });
    await mkdir(destDir, { recursive: true });
    await writeFile(join(srcDir, "agent-one.md"), "# Agent One");
    await writeFile(join(srcDir, "agent-two.md"), "# Agent Two");

    const result = await syncAssets({
      srcDir,
      destDir,
      dryRun: false,
      extension: ".md",
    });

    expect(result.copied).toBe(2);
    expect(result.files).toContain("agent-one.md");
    expect(result.files).toContain("agent-two.md");
    const destFiles = await readdir(destDir);
    expect(destFiles.sort()).toEqual(["agent-one.md", "agent-two.md"]);
  });

  it("skips files that already match on disk", async () => {
    const srcDir = join(tmpDir, "src-skip");
    const destDir = join(tmpDir, "dest-skip");
    await mkdir(srcDir, { recursive: true });
    await mkdir(destDir, { recursive: true });
    const content = "# Same Content";
    await writeFile(join(srcDir, "agent.md"), content);
    await writeFile(join(destDir, "agent.md"), content);

    const result = await syncAssets({
      srcDir,
      destDir,
      dryRun: false,
      extension: ".md",
    });

    expect(result.skipped).toBe(1);
    expect(result.copied).toBe(0);
  });

  it("removes old manifest files no longer in source", async () => {
    const srcDir = join(tmpDir, "src-remove");
    const destDir = join(tmpDir, "dest-remove");
    await mkdir(srcDir, { recursive: true });
    await mkdir(destDir, { recursive: true });
    await writeFile(join(srcDir, "new-agent.md"), "# New");
    await writeFile(join(destDir, "old-agent.md"), "# Old");

    const result = await syncAssets({
      srcDir,
      destDir,
      dryRun: false,
      extension: ".md",
      oldManifestFiles: ["old-agent.md"],
    });

    expect(result.copied).toBe(1);
    expect(result.removed).toBe(1);
    const destFiles = await readdir(destDir);
    expect(destFiles).toEqual(["new-agent.md"]);
  });

  it("respects dryRun — does not write files", async () => {
    const srcDir = join(tmpDir, "src-dry");
    const destDir = join(tmpDir, "dest-dry");
    await mkdir(srcDir, { recursive: true });
    await mkdir(destDir, { recursive: true });
    await writeFile(join(srcDir, "agent.md"), "# Content");

    const result = await syncAssets({
      srcDir,
      destDir,
      dryRun: true,
      extension: ".md",
    });

    expect(result.files).toContain("agent.md");
    const destFiles = await readdir(destDir);
    expect(destFiles).toHaveLength(0);
  });
});
