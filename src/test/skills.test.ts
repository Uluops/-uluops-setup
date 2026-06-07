import { describe, it, expect, beforeEach } from "vitest";
import { mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { installSkills, uninstallSkills } from "../steps/skills.js";
import type { HarnessProfile } from "../harnesses/index.js";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "uluops-skills-"));
});

describe("installSkills", () => {
  it("installs Codex skill assets into the harness skills dir", async () => {
    const skillsDir = join(tmpDir, "skills");
    const profile = {
      name: "codex",
      paths: { skillsDir },
    } as unknown as HarnessProfile;

    const result = await installSkills(profile, false, false);

    expect(result.files).toContain("uluops-operator/SKILL.md");
    expect(result.failures).toEqual([]);

    const content = await readFile(
      join(skillsDir, "uluops-operator", "SKILL.md"),
      "utf-8",
    );
    expect(content).toContain("name: uluops-operator");
    expect(content).toContain("Canonical Loop");
  });

  it("skips harnesses without skill assets", async () => {
    const profile = {
      name: "claude-code",
      paths: { skillsDir: join(tmpDir, "skills") },
    } as unknown as HarnessProfile;

    const result = await installSkills(profile, false, false);

    expect(result.skippedReason).toBe("not-supported");
    expect(result.files).toEqual([]);
  });
});

describe("uninstallSkills", () => {
  it("removes installed skill files but preserves non-empty user skill dirs", async () => {
    const skillsDir = join(tmpDir, "skills", "uluops-operator");
    await mkdir(skillsDir, { recursive: true });
    await writeFile(join(skillsDir, "SKILL.md"), "installed");
    await writeFile(join(skillsDir, "notes.md"), "user note");

    const removed = await uninstallSkills(["uluops-operator/SKILL.md"], tmpDir);

    expect(removed).toBe(1);
    const remaining = await readdir(skillsDir);
    expect(remaining).toEqual(["notes.md"]);
  });
});
