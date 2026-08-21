import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  serialize,
  recordWrite,
  fileMatchesLastWrite,
  hasRecordedWrite,
  resetCoordinatorForTests,
} from "../lib/write-coordinator.js";
import { atomicWrite } from "../lib/atomic-write.js";

let dir: string;

beforeEach(async () => {
  resetCoordinatorForTests();
  dir = await mkdtemp(join(tmpdir(), "uluops-coord-test-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("serialize", () => {
  it("runs same-path operations strictly in order, even when the first is slow", async () => {
    const order: string[] = [];
    const slow = serialize("/tmp/same-file", async () => {
      await new Promise((r) => setTimeout(r, 30));
      order.push("first");
    });
    const fast = serialize("/tmp/same-file", async () => {
      order.push("second");
    });
    await Promise.all([slow, fast]);
    expect(order).toEqual(["first", "second"]);
  });

  it("does not block operations on a different path", async () => {
    const order: string[] = [];
    const a = serialize("/tmp/file-a", async () => {
      await new Promise((r) => setTimeout(r, 30));
      order.push("a");
    });
    const b = serialize("/tmp/file-b", async () => {
      order.push("b");
    });
    await Promise.all([a, b]);
    expect(order).toEqual(["b", "a"]);
  });

  it("a failed operation propagates but does not poison the chain", async () => {
    await expect(
      serialize("/tmp/chain", async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    await expect(
      serialize("/tmp/chain", async () => "still works"),
    ).resolves.toBe("still works");
  });
});

describe("write attestation + restore guard", () => {
  it("atomicWrite records the write; unmodified file matches", async () => {
    const p = join(dir, "settings.json");
    await atomicWrite(p, '{"a":1}');
    expect(hasRecordedWrite(p)).toBe(true);
    expect(await fileMatchesLastWrite(p)).toBe(true);
  });

  // The break-test: the guard must FAIL on outside modification, or it
  // guards nothing.
  it("returns false when someone else modified the file after our write", async () => {
    const p = join(dir, "settings.json");
    await atomicWrite(p, '{"a":1}');
    await writeFile(p, '{"a":1,"user":"edit"}');
    expect(await fileMatchesLastWrite(p)).toBe(false);
  });

  it("returns false for a path this process never wrote", async () => {
    const p = join(dir, "untouched.json");
    await writeFile(p, "{}");
    expect(await fileMatchesLastWrite(p)).toBe(false);
  });

  it("a missing file counts as matching (nothing of anyone else's to clobber)", async () => {
    const p = join(dir, "gone.json");
    recordWrite(p, "content");
    expect(await fileMatchesLastWrite(p)).toBe(true);
  });

  it("only the LAST write counts", async () => {
    const p = join(dir, "settings.json");
    await atomicWrite(p, "v1");
    await atomicWrite(p, "v2");
    expect(await fileMatchesLastWrite(p)).toBe(true);
    await writeFile(p, "v1"); // revert to an EARLIER of our writes = outside edit
    expect(await fileMatchesLastWrite(p)).toBe(false);
  });
});
