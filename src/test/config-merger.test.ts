import { describe, it, expect, vi, afterEach } from "vitest";
import { mergeUluopsMcp, removeUluopsMcp } from "../lib/config-merger.js";

describe("mergeUluopsMcp", () => {
  it("adds both MCP servers to empty config", () => {
    const result = mergeUluopsMcp({}, "ulr_test123");
    expect(result.mcpServers).toBeDefined();
    expect(result.mcpServers!["uluops-tracker"]).toMatchObject({
      command: "npx",
      args: ["-y", "@uluops/ops-mcp"],
      env: {
        ULUOPS_API_KEY: "ulr_test123",
      },
    });
    expect(result.mcpServers!["uluops-registry"]).toMatchObject({
      command: "npx",
      args: ["-y", "@uluops/registry-mcp"],
      env: {
        ULUOPS_API_KEY: "ulr_test123",
      },
    });
  });

  it("does not stamp backend URLs (resolved by MCP SDKs)", () => {
    const result = mergeUluopsMcp({}, "ulr_test123");
    expect(result.mcpServers!["uluops-tracker"]!.env).not.toHaveProperty("ULUOPS_BASE_URL");
    expect(result.mcpServers!["uluops-registry"]!.env).not.toHaveProperty("ULUOPS_REGISTRY_URL");
  });

  it("preserves existing non-UluOps MCP servers", () => {
    const config = {
      mcpServers: {
        "other-server": { command: "node", args: ["./other.js"], env: {} },
      },
    };
    const result = mergeUluopsMcp(config, "ulr_abc");
    expect(result.mcpServers!["other-server"]).toBeDefined();
    expect(result.mcpServers!["uluops-tracker"]).toBeDefined();
  });

  it("preserves all top-level non-mcpServers keys", () => {
    const config = {
      numStartups: 42,
      tipsHistory: ["tip1"],
      mcpServers: {},
    };
    const result = mergeUluopsMcp(config, "ulr_abc");
    expect(result.numStartups).toBe(42);
    expect(result.tipsHistory).toEqual(["tip1"]);
  });

  it("overwrites existing UluOps servers with new API key", () => {
    const config = {
      mcpServers: {
        "uluops-registry": {
          command: "npx",
          args: ["-y", "@uluops/registry-mcp"],
          env: { ULUOPS_API_KEY: "ulr_old", ULUOPS_REGISTRY_URL: "https://api.uluops.ai/api/v1/registry" },
        },
      },
    };
    const result = mergeUluopsMcp(config, "ulr_new");
    expect(result.mcpServers!["uluops-registry"]!.env["ULUOPS_API_KEY"]).toBe("ulr_new");
  });
});

describe("removeUluopsMcp", () => {
  it("removes both UluOps servers", () => {
    const config = {
      mcpServers: {
        "uluops-tracker": { command: "npx", args: [], env: {} },
        "uluops-registry": { command: "npx", args: [], env: {} },
      },
    };
    const result = removeUluopsMcp(config);
    expect(result.mcpServers).toBeUndefined();
  });

  it("preserves non-UluOps servers when removing", () => {
    const config = {
      mcpServers: {
        "uluops-tracker": { command: "npx", args: [], env: {} },
        "other-server": { command: "node", args: [], env: {} },
      },
    };
    const result = removeUluopsMcp(config);
    expect(result.mcpServers!["other-server"]).toBeDefined();
    expect(result.mcpServers!["uluops-tracker"]).toBeUndefined();
  });

  it("preserves top-level keys other than mcpServers", () => {
    const config = {
      numStartups: 5,
      mcpServers: {
        "uluops-tracker": { command: "npx", args: [], env: {} },
      },
    };
    const result = removeUluopsMcp(config);
    expect((result as { numStartups?: number }).numStartups).toBe(5);
  });

  it("handles config with no mcpServers key", () => {
    const result = removeUluopsMcp({ numStartups: 1 });
    expect(result.mcpServers).toBeUndefined();
  });
});

describe("checkMcpPackageAvailability", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("includes the rejection reason for network failures instead of 'unknown'", async () => {
    const { checkMcpPackageAvailability } = await import(
      "../lib/config-merger.js"
    );
    // Make every fetch reject with a real Error so we exercise the rejection
    // branch (network/DNS/timeout class).
    globalThis.fetch = vi
      .fn()
      .mockRejectedValue(
        Object.assign(new Error("getaddrinfo ENOTFOUND registry.npmjs.org"), {
          code: "ENOTFOUND",
        }),
      ) as unknown as typeof fetch;

    const result = await checkMcpPackageAvailability();
    expect(result.available).toEqual([]);
    expect(result.missing).toHaveLength(2);
    // Each missing entry now carries the package name AND the network reason —
    // no literal 'unknown' fallback that hides the real failure.
    for (const entry of result.missing) {
      expect(entry).not.toBe("unknown");
      expect(entry).toMatch(/@uluops\/(ops-mcp|registry-mcp)/);
      expect(entry).toContain("network:");
      expect(entry).toContain("ENOTFOUND");
    }
  });

  it("emits the bare package name (no annotation) on registry-side miss (non-2xx)", async () => {
    const { checkMcpPackageAvailability } = await import(
      "../lib/config-merger.js"
    );
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    }) as unknown as typeof fetch;

    const result = await checkMcpPackageAvailability();
    expect(result.available).toEqual([]);
    expect(result.missing).toEqual([
      "@uluops/ops-mcp",
      "@uluops/registry-mcp",
    ]);
    // No `(network: ...)` suffix on registry-side misses.
    for (const entry of result.missing) {
      expect(entry).not.toContain("network:");
    }
  });
});
