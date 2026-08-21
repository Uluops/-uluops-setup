import { describe, it, expect } from "vitest";
import { extractEmail } from "../lib/json-guards.js";

describe("extractEmail", () => {
  it("returns the email from a well-formed envelope", () => {
    expect(extractEmail({ data: { email: "user@example.com" } })).toBe(
      "user@example.com",
    );
  });

  it("returns null when data is absent", () => {
    expect(extractEmail({})).toBeNull();
  });

  it("returns null when data is null", () => {
    expect(extractEmail({ data: null })).toBeNull();
  });

  it("returns null when data is not an object", () => {
    expect(extractEmail({ data: "user@example.com" })).toBeNull();
  });

  it("returns null when email is missing from data", () => {
    expect(extractEmail({ data: {} })).toBeNull();
  });

  it("returns null when email is not a string", () => {
    expect(extractEmail({ data: { email: 42 } })).toBeNull();
  });

  // Arrays are typeof "object": they pass the top-level shape gate and fall
  // through to null (no data field) rather than throwing. Pinned so a
  // stricter future gate is a deliberate change, not drift.
  it("returns null for an array body", () => {
    expect(extractEmail([])).toBeNull();
  });

  // The throw path is the contract boundary: a non-object body means the
  // endpoint is not the one we expect (HTML error page, captive portal).
  it("throws on a string body", () => {
    expect(() => extractEmail("<html>error</html>")).toThrow(
      /unexpected response shape/,
    );
  });

  it("throws on a null body", () => {
    expect(() => extractEmail(null)).toThrow(/unexpected response shape/);
  });

  // Plain Error, not TypeError — call sites translate TypeError into
  // "Can't reach api.uluops.ai" (fetch's network-failure shape).
  it("throws a plain Error, never a TypeError", () => {
    try {
      extractEmail(null);
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
      expect(err).not.toBeInstanceOf(TypeError);
    }
  });
});
