import { describe, it, expect } from "vitest";
import { fileHash } from "../lib/hash.js";

describe("fileHash", () => {
  it("returns a 64-character hex string (full SHA-256)", () => {
    const hash = fileHash("hello world");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("returns same hash for same content", () => {
    expect(fileHash("test")).toBe(fileHash("test"));
  });

  it("returns different hash for different content", () => {
    expect(fileHash("a")).not.toBe(fileHash("b"));
  });
});
