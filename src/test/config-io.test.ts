import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFile, unlink, mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { readConfig, writeConfig } from "../lib/config-merger.js";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "uluops-config-io-"));
});

afterEach(async () => {
  try {
    const { readdir } = await import("node:fs/promises");
    for (const f of await readdir(tmpDir)) {
      await unlink(join(tmpDir, f));
    }
  } catch {
    // cleanup best-effort
  }
});

describe("readConfig", () => {
  it("returns empty object when file does not exist", async () => {
    const result = await readConfig(join(tmpDir, "nonexistent.json"));
    expect(result).toEqual({});
  });

  it("returns empty object on malformed JSON", async () => {
    const path = join(tmpDir, "bad.json");
    await writeFile(path, "{ invalid }");
    const result = await readConfig(path);
    expect(result).toEqual({});
  });

  it("parses valid JSON correctly", async () => {
    const path = join(tmpDir, "good.json");
    await writeFile(path, JSON.stringify({ mcpServers: {}, numStartups: 5 }));
    const result = await readConfig(path);
    expect(result.mcpServers).toEqual({});
    expect(result.numStartups).toBe(5);
  });
});

describe("writeConfig", () => {
  it("writes formatted JSON with trailing newline", async () => {
    const path = join(tmpDir, "output.json");
    await writeConfig(path, { mcpServers: {}, foo: "bar" });
    const raw = await readFile(path, "utf-8");
    expect(raw).toMatch(/\n$/);
    const parsed = JSON.parse(raw);
    expect(parsed.foo).toBe("bar");
  });

  it("round-trips through readConfig", async () => {
    const path = join(tmpDir, "roundtrip.json");
    const config = { mcpServers: { test: { command: "echo", args: [], env: {} } }, extra: true };
    await writeConfig(path, config);
    const loaded = await readConfig(path);
    expect(loaded).toEqual(config);
  });
});
