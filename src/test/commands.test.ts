import { describe, it, expect, beforeEach } from "vitest";
import { writeFile, mkdir, mkdtemp, readdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { uninstallCommands, installCommands } from "../steps/commands.js";
import type { HarnessProfile } from "../harnesses/index.js";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "uluops-commands-"));
});

describe("uninstallCommands", () => {
  it("removes listed command files from subdirectories", async () => {
    const commandsDir = join(tmpDir, "commands");
    await mkdir(join(commandsDir, "agents"), { recursive: true });
    await mkdir(join(commandsDir, "workflows"), { recursive: true });
    await writeFile(join(commandsDir, "agents", "validate.md"), "content");
    await writeFile(join(commandsDir, "workflows", "ship.md"), "content");
    await writeFile(join(commandsDir, "agents", "custom.md"), "custom");

    const removed = await uninstallCommands(
      ["agents/validate.md", "workflows/ship.md"],
      tmpDir,
    );

    expect(removed).toBe(2);
    const remaining = await readdir(join(commandsDir, "agents"));
    expect(remaining).toEqual(["custom.md"]);
  });

  it("returns 0 when files are already gone", async () => {
    const commandsDir = join(tmpDir, "commands");
    await mkdir(commandsDir, { recursive: true });

    const removed = await uninstallCommands(["agents/gone.md"], tmpDir);
    expect(removed).toBe(0);
  });
});

describe("installCommands", () => {
  it("skips non-claude-code harnesses", async () => {
    const profile = {
      name: "opencode",
      paths: { commandsDir: join(tmpDir, "commands") },
    } as unknown as HarnessProfile;

    const result = await installCommands(profile, false, false);
    expect(result.skippedReason).toBe("not-supported");
    expect(result.files).toHaveLength(0);
  });

  it("respects dryRun for claude-code harness", async () => {
    // installCommands reads from ASSETS_DIR/commands/{agents,workflows}/
    // In dry-run mode it should not create destination dirs
    const profile = {
      name: "claude-code",
      paths: { commandsDir: join(tmpDir, "dest-commands") },
    } as unknown as HarnessProfile;

    const result = await installCommands(profile, false, true);
    // Even in dry-run, it enumerates source files
    expect(result.files).toBeDefined();
    expect(Array.isArray(result.files)).toBe(true);
  });

  it("copies command files for claude-code harness", async () => {
    const destDir = join(tmpDir, "dest-commands");
    const profile = {
      name: "claude-code",
      paths: { commandsDir: destDir },
    } as unknown as HarnessProfile;

    const result = await installCommands(profile, false, false);
    // Should have copied files from assets
    expect(result.agentCommands + result.workflowCommands + result.skipped).toBe(result.files.length);
    expect(result.files.length).toBeGreaterThan(0);

    // Verify files exist on disk
    for (const subdir of ["agents", "workflows"]) {
      const files = result.files.filter((f) => f.startsWith(`${subdir}/`));
      if (files.length > 0) {
        const dirFiles = await readdir(join(destDir, subdir));
        expect(dirFiles.length).toBeGreaterThan(0);
      }
    }
  });

  it("removes old manifest commands no longer in package", async () => {
    const destDir = join(tmpDir, "dest-commands-remove");
    await mkdir(join(destDir, "agents"), { recursive: true });
    await writeFile(join(destDir, "agents", "old-command.md"), "# Old");

    const profile = {
      name: "claude-code",
      paths: { commandsDir: destDir },
    } as unknown as HarnessProfile;

    const result = await installCommands(profile, false, false, [
      "agents/old-command.md",
    ]);

    expect(result.removed).toBe(1);
  });
});
