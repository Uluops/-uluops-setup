import { describe, it, expect, vi, afterEach } from "vitest";
import { resolveApiKey } from "../steps/auth.js";

afterEach(() => {
  vi.unstubAllEnvs();
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

  it("throws when key does not start with ulr_", async () => {
    await expect(
      resolveApiKey({
        apiKeyFlag: "bad_key",
        skipValidation: true,
      }),
    ).rejects.toThrow("API keys start with ulr_");
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
