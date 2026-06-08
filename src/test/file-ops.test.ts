import { describe, it, expect, beforeEach } from "vitest";
import { writeFile, readFile, mkdir, mkdtemp, readdir, access } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { copyIfChanged, unlinkFiles, syncAssets, writeIfChanged } from "../lib/file-ops.js";
import { atomicWrite } from "../lib/atomic-write.js";

let tmpDir: string;
let srcDir: string;
let destDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "uluops-fileops-"));
  srcDir = join(tmpDir, "src");
  destDir = join(tmpDir, "dest");
  await mkdir(srcDir, { recursive: true });
  await mkdir(destDir, { recursive: true });
});

describe("copyIfChanged", () => {
  it("copies file when destination does not exist", async () => {
    await writeFile(join(srcDir, "a.md"), "content A");
    const result = await copyIfChanged(
      join(srcDir, "a.md"),
      join(destDir, "a.md"),
      false,
    );
    expect(result).toBe("copied");
    expect(await readFile(join(destDir, "a.md"), "utf-8")).toBe("content A");
  });

  it("skips file when content is identical", async () => {
    await writeFile(join(srcDir, "a.md"), "same");
    await writeFile(join(destDir, "a.md"), "same");
    const result = await copyIfChanged(
      join(srcDir, "a.md"),
      join(destDir, "a.md"),
      false,
    );
    expect(result).toBe("skipped");
  });

  it("copies file when content differs", async () => {
    await writeFile(join(srcDir, "a.md"), "new content");
    await writeFile(join(destDir, "a.md"), "old content");
    const result = await copyIfChanged(
      join(srcDir, "a.md"),
      join(destDir, "a.md"),
      false,
    );
    expect(result).toBe("copied");
    expect(await readFile(join(destDir, "a.md"), "utf-8")).toBe("new content");
  });

  it("does not write in dry-run mode", async () => {
    await writeFile(join(srcDir, "a.md"), "content");
    const result = await copyIfChanged(
      join(srcDir, "a.md"),
      join(destDir, "a.md"),
      true,
    );
    expect(result).toBe("copied");
    // File should NOT exist
    const files = await readdir(destDir);
    expect(files).not.toContain("a.md");
  });
});

describe("unlinkFiles", () => {
  it("removes listed files and returns count", async () => {
    await writeFile(join(destDir, "a.md"), "a");
    await writeFile(join(destDir, "b.md"), "b");
    const removed = await unlinkFiles(destDir, ["a.md", "b.md"]);
    expect(removed).toBe(2);
    expect(await readdir(destDir)).toEqual([]);
  });

  it("returns 0 for already-missing files", async () => {
    const removed = await unlinkFiles(destDir, ["nonexistent.md"]);
    expect(removed).toBe(0);
  });
});

describe("syncAssets", () => {
  it("copies all .md files from source to destination", async () => {
    await writeFile(join(srcDir, "one.md"), "one");
    await writeFile(join(srcDir, "two.md"), "two");
    await writeFile(join(srcDir, "skip.txt"), "not md");

    const result = await syncAssets({ srcDir, destDir, dryRun: false });
    expect(result.copied).toBe(2);
    expect(result.files).toContain("one.md");
    expect(result.files).toContain("two.md");
    expect(result.files).not.toContain("skip.txt");
  });

  it("skips unchanged files on second run", async () => {
    await writeFile(join(srcDir, "one.md"), "content");

    await syncAssets({ srcDir, destDir, dryRun: false });
    const result = await syncAssets({ srcDir, destDir, dryRun: false });
    expect(result.copied).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it("removes old manifest files no longer in source", async () => {
    await writeFile(join(srcDir, "keep.md"), "keep");
    await writeFile(join(destDir, "removed.md"), "old");

    const result = await syncAssets({
      srcDir,
      destDir,
      dryRun: false,
      oldManifestFiles: ["keep.md", "removed.md"],
    });
    expect(result.removed).toBe(1);
    expect(await readdir(destDir)).toContain("keep.md");
    expect(await readdir(destDir)).not.toContain("removed.md");
  });

  it("creates destination directory if missing", async () => {
    const newDest = join(tmpDir, "newdir");
    await writeFile(join(srcDir, "a.md"), "a");

    const result = await syncAssets({
      srcDir,
      destDir: newDest,
      dryRun: false,
    });
    expect(result.copied).toBe(1);
    expect(await readdir(newDest)).toContain("a.md");
  });
});

describe("writeIfChanged", () => {
  it("writes file when destination does not exist", async () => {
    const dest = join(destDir, "new.md");
    const result = await writeIfChanged(dest, "hello", false);
    expect(result).toBe("copied");
    expect(await readFile(dest, "utf-8")).toBe("hello");
  });

  it("skips when content is identical", async () => {
    const dest = join(destDir, "same.md");
    await writeFile(dest, "unchanged");
    const result = await writeIfChanged(dest, "unchanged", false);
    expect(result).toBe("skipped");
  });

  it("writes when content differs", async () => {
    const dest = join(destDir, "diff.md");
    await writeFile(dest, "old");
    const result = await writeIfChanged(dest, "new", false);
    expect(result).toBe("copied");
    expect(await readFile(dest, "utf-8")).toBe("new");
  });

  it("does not write in dry-run mode", async () => {
    const dest = join(destDir, "dryrun.md");
    const result = await writeIfChanged(dest, "content", true);
    expect(result).toBe("copied");
    await expect(access(dest)).rejects.toThrow();
  });
});

describe("atomicWrite", () => {
  it("cleans up temp file on rename failure", async () => {
    const dest = join(tmpDir, "nodir", "nested", "file.json");
    // rename will fail because parent directory doesn't exist
    await expect(atomicWrite(dest, "content")).rejects.toThrow();
    // Temp file should not remain
    const files = await readdir(tmpDir);
    expect(files.every((f) => !f.includes(".uluops-tmp"))).toBe(true);
  });
});
