import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { writeFile, mkdir, mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { resolveApiKey } from "../steps/auth.js";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "uluops-auth-"));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
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

    // Mock homedir to point to our tmpDir so readCredentialsFile finds our fixture
    vi.mock("node:os", async (importOriginal) => {
      const original = await importOriginal<typeof import("node:os")>();
      return { ...original, homedir: () => tmpDir };
    });

    // Re-import to pick up the mocked homedir
    const { resolveApiKey: resolve } = await import("../steps/auth.js");

    vi.stubEnv("ULUOPS_API_KEY", "");
    const result = await resolve({ interactive: false, skipValidation: true });
    expect(result.apiKey).toBe("ulr_fromfile");

    vi.restoreAllMocks();
  });

  it("reads api_key (snake_case) from credentials.json", async () => {
    const credsDir = join(tmpDir, ".uluops");
    await mkdir(credsDir, { recursive: true });
    await writeFile(
      join(credsDir, "credentials.json"),
      JSON.stringify({ default: { api_key: "ulr_snakecase" } }),
    );

    vi.mock("node:os", async (importOriginal) => {
      const original = await importOriginal<typeof import("node:os")>();
      return { ...original, homedir: () => tmpDir };
    });

    const { resolveApiKey: resolve } = await import("../steps/auth.js");

    vi.stubEnv("ULUOPS_API_KEY", "");
    const result = await resolve({ interactive: false, skipValidation: true });
    expect(result.apiKey).toBe("ulr_snakecase");

    vi.restoreAllMocks();
  });

  it("throws when all sources fail", async () => {
    vi.stubEnv("ULUOPS_API_KEY", "");
    await expect(
      resolveApiKey({ interactive: false, skipValidation: true }),
    ).rejects.toThrow("No API key found");
  });
});
