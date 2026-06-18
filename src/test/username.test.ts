import { describe, it, expect, vi, afterEach } from "vitest";
import { validateUsername, setUsername, maybeSetUsername } from "../steps/username.js";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("validateUsername", () => {
  it("accepts canonical slugs", () => {
    expect(validateUsername("ulu-labs")).toBe(true);
    expect(validateUsername("123user")).toBe(true);
    expect(validateUsername("a_b")).toBe(true);
    expect(validateUsername("ab")).toBe(true);
  });

  it("rejects invalid slugs", () => {
    expect(validateUsername("")).not.toBe(true);
    expect(validateUsername("UPPER")).not.toBe(true);
    expect(validateUsername("-bad")).not.toBe(true);
    expect(validateUsername("bad-")).not.toBe(true);
    expect(validateUsername("a".repeat(41))).not.toBe(true);
  });
});

describe("setUsername", () => {
  it("PATCHes /auth/profile with the api key and returns the confirmed username", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { user: { username: "ulu-labs" } } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await setUsername("ulr_key", "ulu-labs");

    expect(result).toBe("ulu-labs");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toContain("/auth/profile");
    expect(init.method).toBe("PATCH");
    expect(init.headers.Authorization).toBe("Bearer ulr_key");
    expect(JSON.parse(init.body)).toEqual({ username: "ulu-labs" });
  });

  it("throws a friendly error on 409", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: () => Promise.resolve({ error: { message: "already in use" } }),
      }),
    );
    await expect(setUsername("k", "taken")).rejects.toThrow(/unavailable/i);
  });
});

describe("maybeSetUsername", () => {
  it("skips entirely when there is no api key", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const emit = vi.fn();

    await maybeSetUsername({ apiKey: null, interactive: true, dryRun: false, emit });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });

  it("skips silently when non-interactive with no --username", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const emit = vi.fn();

    await maybeSetUsername({ apiKey: "k", interactive: false, dryRun: false, emit });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });

  it("sets the username non-interactively when --username is supplied", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { user: { username: "ulu-labs" } } }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const emit = vi.fn();

    await maybeSetUsername({ apiKey: "k", username: "ulu-labs", interactive: false, dryRun: false, emit });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith(expect.stringContaining("ulu-labs"));
  });

  it("describes without writing on dry run", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const emit = vi.fn();

    await maybeSetUsername({ apiKey: "k", username: "ulu-labs", interactive: false, dryRun: true, emit });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(emit).toHaveBeenCalledWith(expect.stringContaining("Would set"));
  });

  it("warns and does not throw when --username is malformed", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const emit = vi.fn();

    await maybeSetUsername({ apiKey: "k", username: "Bad Name", interactive: false, dryRun: false, emit });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(emit).toHaveBeenCalledWith(expect.stringContaining("Skipping username"));
  });

  it("warns (does not throw) when the API rejects the username", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: () => Promise.resolve({ error: { message: "already in use" } }),
      }),
    );
    const emit = vi.fn();

    await maybeSetUsername({ apiKey: "k", username: "taken", interactive: false, dryRun: false, emit });

    expect(emit).toHaveBeenCalledWith(expect.stringContaining("unavailable"));
  });
});
