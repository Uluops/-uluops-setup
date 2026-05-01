import { describe, it, expect, vi, afterEach } from "vitest";
import { validatePassword, validateEmail } from "../steps/signup.js";

describe("validatePassword", () => {
  it("accepts a valid password", () => {
    expect(validatePassword("GoodPass1")).toBe(true);
  });

  it("warns for passwords shorter than 8 chars", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(validatePassword("Short1A")).toBe(true);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("at least 8"));
    warnSpy.mockRestore();
  });

  it("warns for passwords longer than 128 chars", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const long = "Aa1" + "x".repeat(126);
    expect(validatePassword(long)).toBe(true);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("128"));
    warnSpy.mockRestore();
  });

  it("warns for passwords without lowercase", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(validatePassword("ALLCAPS123")).toBe(true);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("lowercase"));
    warnSpy.mockRestore();
  });

  it("warns for passwords without uppercase", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(validatePassword("alllower123")).toBe(true);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("uppercase"));
    warnSpy.mockRestore();
  });

  it("warns for passwords without number", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(validatePassword("NoNumbersHere")).toBe(true);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("number"));
    warnSpy.mockRestore();
  });
});

describe("validateEmail", () => {
  it("accepts a valid email", () => {
    expect(validateEmail("user@example.com")).toBe(true);
  });

  it("rejects empty string", () => {
    expect(validateEmail("")).toContain("required");
  });

  it("rejects missing @", () => {
    expect(validateEmail("notanemail")).toContain("Invalid");
  });

  it("rejects missing domain", () => {
    expect(validateEmail("user@")).toContain("Invalid");
  });
});

describe("signup (network)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("handles 409 conflict (duplicate email)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({ error: { message: "Email already exists" } }),
        headers: new Headers(),
      }),
    );

    const { signup } = await import("../steps/signup.js");

    vi.mock("@inquirer/prompts", () => ({
      input: vi.fn().mockResolvedValue("existing@example.com"),
      password: vi.fn().mockResolvedValue("ValidPass1"),
    }));

    await expect(signup()).rejects.toThrow("already registered");
    vi.unstubAllGlobals();
  });

  it("handles 429 rate limit", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        json: async () => ({ error: { message: "Too many requests" } }),
        headers: new Headers({ "Retry-After": "30" }),
      }),
    );

    const { signup } = await import("../steps/signup.js");

    vi.mock("@inquirer/prompts", () => ({
      input: vi.fn().mockResolvedValue("user@example.com"),
      password: vi.fn().mockResolvedValue("ValidPass1"),
    }));

    await expect(signup()).rejects.toThrow("Rate limited");
    vi.unstubAllGlobals();
  });

  it("handles network failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("fetch failed")),
    );

    const { signup } = await import("../steps/signup.js");

    vi.mock("@inquirer/prompts", () => ({
      input: vi.fn().mockResolvedValue("user@example.com"),
      password: vi.fn().mockResolvedValue("ValidPass1"),
    }));

    await expect(signup()).rejects.toThrow("Can't reach");
    vi.unstubAllGlobals();
  });
});
