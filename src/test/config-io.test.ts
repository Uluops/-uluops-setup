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

  it("throws on malformed JSON to prevent silent data loss", async () => {
    const path = join(tmpDir, "bad.json");
    await writeFile(path, "{ invalid }");
    await expect(readConfig(path)).rejects.toThrow("invalid JSON");
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

describe("readConfig shape gate", () => {
  // Mirror of the readSettings shape-gate suite — same gate, same contract:
  // valid JSON that is not a top-level object is unmergeable and must throw
  // the named-path error, never be coerced.
  it("rejects a top-level array", async () => {
    const p = join(tmpDir, "config.json");
    await writeFile(p, "[1,2,3]");
    await expect(readConfig(p)).rejects.toThrow(/JSON object at the top level/);
  });

  it("rejects a top-level string", async () => {
    const p = join(tmpDir, "config.json");
    await writeFile(p, '"just a string"');
    await expect(readConfig(p)).rejects.toThrow(/JSON object at the top level/);
  });

  it("rejects a top-level number", async () => {
    const p = join(tmpDir, "config.json");
    await writeFile(p, "42");
    await expect(readConfig(p)).rejects.toThrow(/JSON object at the top level/);
  });

  it("rejects top-level null", async () => {
    const p = join(tmpDir, "config.json");
    await writeFile(p, "null");
    await expect(readConfig(p)).rejects.toThrow(/JSON object at the top level/);
  });

  it("names pre-existing corruption as pre-existing on invalid JSON", async () => {
    const p = join(tmpDir, "config.json");
    await writeFile(p, "{ not json");
    await expect(readConfig(p)).rejects.toThrow(/before any UluOps change/i);
  });

  it("strips __proto__ own-keys at the read boundary", async () => {
    const p = join(tmpDir, "config.json");
    await writeFile(p, '{"__proto__":{"polluted":1},"keep":true}');
    const config = await readConfig(p);
    expect(Object.prototype.hasOwnProperty.call(config, "__proto__")).toBe(false);
    expect((config as Record<string, unknown>)["keep"]).toBe(true);
  });
});
