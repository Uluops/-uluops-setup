import { describe, it, expect, beforeEach } from "vitest";
import { writeFile, mkdir, mkdtemp, readdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { uninstallAgents, installAgents } from "../steps/agents.js";
import { syncAssets } from "../lib/file-ops.js";
import type { HarnessProfile } from "../harnesses/index.js";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "uluops-agents-"));
});

describe("installAgents integration", () => {
  it("orchestrates agent installation for a profile", async () => {
    const agentsDir = join(tmpDir, "harness-agents");
    const profile = {
      name: "claude-code",
      displayName: "Claude Code",
      agentExtension: ".md",
      paths: {
        agentsDir,
      }
    } as unknown as HarnessProfile;

    // We can't easily point AGENTS_SRC to a temp dir without mocking the module,
    // but we can verify it attempts to create the directory and returns a result.
    const result = await installAgents(profile, false, false);

    expect(result.files.length).toBeGreaterThan(0);
    expect(result.failures).toEqual([]);
    const created = await readdir(agentsDir);
    expect(created.length).toBeGreaterThan(0);
  });

  /**
   * Continue-on-error contract. Previously the loop halted on the first
   * `copyIfChanged` throw, leaving the destination half-populated and no
   * record of what failed. We exercise that branch by colliding one
   * destination path with a directory (writeFile → EISDIR) and verify:
   *   1. the failing file shows up in `failures` with its error message
   *   2. the remaining files still copy successfully
   *   3. the result's `copied` count reflects only the successes
   *
   * See tracker issue SEM-COM/M ("agents.ts/commands.ts halt mid-loop on
   * copy failure, leaving partial state").
   */
  it("continues past a per-file copy failure and reports it in failures[]", async () => {
    const agentsDir = join(tmpDir, "halt-test-agents");
    await mkdir(agentsDir, { recursive: true });
    // Pre-create one destination path as a directory so the matching writeFile
    // throws EISDIR. The agent name must match a real shipped asset, otherwise
    // installAgents skips it entirely.
    await mkdir(join(agentsDir, "anxiety-reader-agent.md"), {
      recursive: true,
    });

    const profile = {
      name: "claude-code",
      displayName: "Claude Code",
      agentExtension: ".md",
      paths: { agentsDir },
    } as unknown as HarnessProfile;

    const result = await installAgents(profile, false, false);

    expect(result.failures.length).toBeGreaterThanOrEqual(1);
    const failed = result.failures.find(
      (f) => f.file === "anxiety-reader-agent.md",
    );
    expect(failed).toBeDefined();
    expect(failed!.error).toMatch(/EISDIR|illegal operation|directory/i);

    // The rest of the files still made it through.
    expect(result.copied + result.skipped).toBeGreaterThan(0);
    expect(result.files).toContain("aristotle-analyst-agent.md");

    // The failed file must NOT be in result.files. The manifest treats
    // this list as authoritative — including a never-written file here
    // would cause uninstall to attempt to remove a file that does not
    // exist, and verify to falsely report drift. Aligns installAgents
    // with installCommands / installSkills (which already only track
    // successfully-copied files). Required by the multi-target install
    // partial-state contract (spec §7.6.6).
    expect(result.files).not.toContain("anxiety-reader-agent.md");
  });
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

describe("syncAssets", () => {
  // syncAssets is the underlying library function for agent installation.

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
