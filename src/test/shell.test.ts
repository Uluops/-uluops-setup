import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFile, readFile, unlink, mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { writeShellExport, removeShellExport } from "../steps/shell.js";

let tmpDir: string;
let profilePath: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "uluops-test-"));
  profilePath = join(tmpDir, ".bashrc");
});

afterEach(async () => {
  try {
    await unlink(profilePath);
  } catch {
    // may not exist
  }
});

describe("writeShellExport", () => {
  it("creates profile with fenced block if file does not exist", async () => {
    await writeShellExport(profilePath, "ulr_abc123", false);
    const content = await readFile(profilePath, "utf-8");
    expect(content).toContain("# --- UluOps (managed by @uluops/setup) ---");
    expect(content).toContain('export ULUOPS_API_KEY="ulr_abc123"');
    expect(content).toContain("# --- /UluOps ---");
  });

  it("appends fenced block to existing file", async () => {
    await writeFile(profilePath, "# existing content\n");
    await writeShellExport(profilePath, "ulr_abc123", false);
    const content = await readFile(profilePath, "utf-8");
    expect(content).toContain("# existing content");
    expect(content).toContain('export ULUOPS_API_KEY="ulr_abc123"');
  });

  it("replaces existing fenced block on re-run", async () => {
    await writeShellExport(profilePath, "ulr_old", false);
    await writeShellExport(profilePath, "ulr_new", false);
    const content = await readFile(profilePath, "utf-8");
    expect(content).toContain('export ULUOPS_API_KEY="ulr_new"');
    expect(content).not.toContain("ulr_old");
    // Only one fenced block should exist
    expect(content.split("# --- UluOps").length).toBe(2);
  });

  it("does not modify files in dry-run mode", async () => {
    await writeFile(profilePath, "# existing\n");
    await writeShellExport(profilePath, "ulr_abc123", true);
    const content = await readFile(profilePath, "utf-8");
    expect(content).toBe("# existing\n");
  });
});

describe("removeShellExport", () => {
  it("removes the fenced block from the file", async () => {
    const initial = "# before\n\n# --- UluOps (managed by @uluops/setup) ---\nexport ULUOPS_API_KEY=\"ulr_abc\"\n# --- /UluOps ---\n\n# after\n";
    await writeFile(profilePath, initial);
    await removeShellExport(profilePath);
    const content = await readFile(profilePath, "utf-8");
    expect(content).toContain("# before");
    expect(content).toContain("# after");
    expect(content).not.toContain("ULUOPS_API_KEY");
    expect(content).not.toContain("UluOps");
  });

  it("does nothing if no fenced block exists", async () => {
    await writeFile(profilePath, "# no uluops here\n");
    await removeShellExport(profilePath);
    const content = await readFile(profilePath, "utf-8");
    expect(content).toBe("# no uluops here\n");
  });

  it("does nothing if file does not exist", async () => {
    await expect(removeShellExport(join(tmpDir, "nonexistent"))).resolves.toBeUndefined();
  });
});
