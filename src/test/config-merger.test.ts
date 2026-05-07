import { describe, it, expect } from "vitest";
import { mergeUluopsMcp, removeUluopsMcp } from "../lib/config-merger.js";

describe("mergeUluopsMcp", () => {
  it("adds both MCP servers to empty config", () => {
    const result = mergeUluopsMcp({}, "ulr_test123");
    expect(result.mcpServers).toBeDefined();
    expect(result.mcpServers!["uluops-tracker"]).toMatchObject({
      command: "npx",
      args: ["-y", "uluops-tracker-mcp-client"],
      env: {
        ULUOPS_BASE_URL: "https://api.uluops.ai/api/v1",
        ULUOPS_API_KEY: "ulr_test123",
      },
    });
    expect(result.mcpServers!["uluops-registry"]).toMatchObject({
      command: "npx",
      args: ["-y", "uluops-registry-mcp-client"],
      env: {
        ULUOPS_REGISTRY_URL: "https://api.uluops.ai/api/v1/registry",
        ULUOPS_API_KEY: "ulr_test123",
      },
    });
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
          args: ["-y", "uluops-registry-mcp-client"],
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
