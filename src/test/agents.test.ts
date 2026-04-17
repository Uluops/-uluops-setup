import { describe, it, expect, beforeEach } from "vitest";
import { writeFile, mkdir, mkdtemp, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

// agents.ts is a thin wrapper around syncAssets/unlinkFiles.
// We test installAgents indirectly via the same file-ops primitives,
// and uninstallAgents directly.

import { uninstallAgents } from "../steps/agents.js";

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
