import { describe, it, expect, beforeEach } from "vitest";
import { writeFile, mkdir, mkdtemp, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { uninstallCommands } from "../steps/commands.js";

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
