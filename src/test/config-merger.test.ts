import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { mergeUluopsMcp, removeUluopsMcp } from "../lib/config-merger.js";
import {
  OPS_MCP_SPEC,
  OPS_MCP_VERSION,
  REGISTRY_MCP_SPEC,
  REGISTRY_MCP_VERSION,
} from "../lib/mcp-packages.js";

describe("mergeUluopsMcp", () => {
  it("adds both MCP servers to empty config", () => {
    const result = mergeUluopsMcp({}, "ulr_test123");
    expect(result.mcpServers).toBeDefined();
    expect(result.mcpServers!["uluops-tracker"]).toMatchObject({
      command: "npx",
      args: ["-y", OPS_MCP_SPEC],
      env: {
        ULUOPS_API_KEY: "ulr_test123",
      },
    });
    expect(result.mcpServers!["uluops-registry"]).toMatchObject({
      command: "npx",
      args: ["-y", REGISTRY_MCP_SPEC],
      env: {
        ULUOPS_API_KEY: "ulr_test123",
      },
    });
  });

  it("pins MCP server versions (locks the release contract)", () => {
    // Explicit pin assertion so a future edit that accidentally drops the
    // version suffix (back to bare `@uluops/ops-mcp`) fails loudly here.
    // The pin makes a setup release self-contained — what users get on
    // first launch is what the package was tested against.
    const result = mergeUluopsMcp({}, "ulr_test123");
    expect(result.mcpServers!["uluops-tracker"]!.args).toContain(
      `@uluops/ops-mcp@${OPS_MCP_VERSION}`,
    );
    expect(result.mcpServers!["uluops-registry"]!.args).toContain(
      `@uluops/registry-mcp@${REGISTRY_MCP_VERSION}`,
    );
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

  beforeEach(async () => {
    // Memoization landed in config-merger; without resetting between cases
    // the first stub locks the cached result for every subsequent test in
    // this file. See SEM-EFF/M fix.
    const { __resetAvailabilityCacheForTesting } = await import(
      "../lib/config-merger.js"
    );
    __resetAvailabilityCacheForTesting();
  });

  afterEach(async () => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
    const { __resetAvailabilityCacheForTesting } = await import(
      "../lib/config-merger.js"
    );
    __resetAvailabilityCacheForTesting();
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
