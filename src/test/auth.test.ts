import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { writeFile, mkdir, mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

/**
 * One top-level vi.mock for `node:os` instead of repeated calls inside
 * `it()` blocks (the prior pattern). vi.mock is hoisted to module load
 * time globally — calling it from inside a test was the same as calling
 * it at the top, and `vi.restoreAllMocks()` doesn't unwind module mocks.
 * Tests that need a per-case override write to `mockHomeDir` instead.
 *
 * See tracker issue PRA-FRA/M ("vi.mock inside it-blocks in auth.test.ts
 * is fragile").
 */
let mockHomeDir: string | null = null;
vi.mock("node:os", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:os")>();
  return {
    ...original,
    homedir: () => mockHomeDir ?? original.homedir(),
  };
});

import { resolveApiKey, hasCredentialsFile } from "../steps/auth.js";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "uluops-auth-"));
  mockHomeDir = null;
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  mockHomeDir = null;
});

describe("resolveApiKey", () => {
  it("uses --api-key flag when provided", async () => {
    const result = await resolveApiKey({
      apiKeyFlag: "ulr_test123",
      skipValidation: true,
    });
    expect(result.apiKey).toBe("ulr_test123");
    expect(result.email).toBeNull();
  });

  it("uses ULUOPS_API_KEY env var when no flag", async () => {
    vi.stubEnv("ULUOPS_API_KEY", "ulr_envkey");
    const result = await resolveApiKey({
      skipValidation: true,
    });
    expect(result.apiKey).toBe("ulr_envkey");
  });

  it("accepts key with non-standard prefix when skipValidation is true", async () => {
    const result = await resolveApiKey({
      apiKeyFlag: "bad_key",
      skipValidation: true,
    });
    expect(result.apiKey).toBe("bad_key");
    expect(result.email).toBeNull();
  });

  it("throws when no key found and not interactive", async () => {
    vi.stubEnv("ULUOPS_API_KEY", "");
    await expect(
      resolveApiKey({
        interactive: false,
        skipValidation: true,
      }),
    ).rejects.toThrow("No API key found");
  });

  it("flag takes priority over env var", async () => {
    vi.stubEnv("ULUOPS_API_KEY", "ulr_envkey");
    const result = await resolveApiKey({
      apiKeyFlag: "ulr_flagkey",
      skipValidation: true,
    });
    expect(result.apiKey).toBe("ulr_flagkey");
  });
});

describe("credentials file fallback", () => {
  it("reads apiKey from credentials.json when env/flag absent", async () => {
    const credsDir = join(tmpDir, ".uluops");
    await mkdir(credsDir, { recursive: true });
    await writeFile(
      join(credsDir, "credentials.json"),
      JSON.stringify({ default: { apiKey: "ulr_fromfile" } }),
    );

    mockHomeDir = tmpDir;
    vi.stubEnv("ULUOPS_API_KEY", "");
    const result = await resolveApiKey({
      interactive: false,
      skipValidation: true,
    });
    expect(result.apiKey).toBe("ulr_fromfile");
  });

  it("reads api_key (snake_case) from credentials.json", async () => {
    const credsDir = join(tmpDir, ".uluops");
    await mkdir(credsDir, { recursive: true });
    await writeFile(
      join(credsDir, "credentials.json"),
      JSON.stringify({ default: { api_key: "ulr_snakecase" } }),
    );

    mockHomeDir = tmpDir;
    vi.stubEnv("ULUOPS_API_KEY", "");
    const result = await resolveApiKey({
      interactive: false,
      skipValidation: true,
    });
    expect(result.apiKey).toBe("ulr_snakecase");
  });

  it("throws when all sources fail", async () => {
    vi.stubEnv("ULUOPS_API_KEY", "");
    await expect(
      resolveApiKey({ interactive: false, skipValidation: true }),
    ).rejects.toThrow("No API key found");
  });
});

describe("validateKey (server validation path)", () => {
  // Regression coverage for the 0.6.x→0.6.4 fix where validateKey called
  // /registry/users/me (registry-api UUID-typed /:id route → 400) instead of
  // ops-uluops-api /auth/me, and didn't unwrap the { data: { ... } } envelope.

  it("calls /api/v1/auth/me with Bearer header and unwraps body.data.email", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ data: { id: "uuid", email: "user@example.com" } }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await resolveApiKey({
      apiKeyFlag: "ulr_realkey",
      skipValidation: false,
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.uluops.ai/api/v1/auth/me");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer ulr_realkey",
    );
    expect(result.email).toBe("user@example.com");
  });

  it("returns email null when payload omits email", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: { id: "uuid" } }), { status: 200 }),
      ),
    );

    const result = await resolveApiKey({
      apiKeyFlag: "ulr_realkey",
      skipValidation: false,
    });
    expect(result.email).toBeNull();
  });

  it("surfaces 401 with 'Invalid API key' message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("", { status: 401 })),
    );

    await expect(
      resolveApiKey({ apiKeyFlag: "ulr_bad", skipValidation: false }),
    ).rejects.toThrow(/Invalid API key/);
  });

  it("surfaces non-401 HTTP errors with status and --skip-validation hint", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("", { status: 500 })),
    );

    await expect(
      resolveApiKey({ apiKeyFlag: "ulr_realkey", skipValidation: false }),
    ).rejects.toThrow(/API returned 500.*--skip-validation/);
  });

  it("surfaces network failure as connection error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("fetch failed")),
    );

    await expect(
      resolveApiKey({ apiKeyFlag: "ulr_realkey", skipValidation: false }),
    ).rejects.toThrow(/Can't reach api\.uluops\.ai/);
  });
});

describe("hasCredentialsFile", () => {
  it("returns true when ~/.uluops/credentials.json exists", async () => {
    const credsDir = join(tmpDir, ".uluops");
    await mkdir(credsDir, { recursive: true });
    await writeFile(join(credsDir, "credentials.json"), "{}");

    mockHomeDir = tmpDir;
    expect(await hasCredentialsFile()).toBe(true);
  });

  it("returns false when the file does not exist", async () => {
    mockHomeDir = tmpDir;
    expect(await hasCredentialsFile()).toBe(false);
  });
});
