import { describe, it, expect, afterEach } from "vitest";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  getClaudeHome,
  getClaudeJsonPath,
  getLocalMcpPath,
  getManifestPath,
  findProjectRoot,
  setProjectRoot,
} from "../lib/paths.js";

afterEach(() => {
  setProjectRoot(null);
});

describe("path resolution", () => {
  it("getClaudeHome returns ~/.claude", () => {
    expect(getClaudeHome()).toBe(join(homedir(), ".claude"));
  });

  it("getClaudeJsonPath returns ~/.claude.json", () => {
    expect(getClaudeJsonPath()).toBe(join(homedir(), ".claude.json"));
  });

  it("getLocalMcpPath returns .mcp.json in project root", async () => {
    const root = await findProjectRoot();
    expect(await getLocalMcpPath()).toBe(join(root, ".mcp.json"));
  });

  it("getManifestPath returns ~/.uluops/manifest.json", () => {
    expect(getManifestPath()).toBe(
      join(homedir(), ".uluops", "manifest.json"),
    );
  });

  it("setProjectRoot overrides findProjectRoot", async () => {
    setProjectRoot("/tmp/test-project");
    expect(await findProjectRoot()).toBe("/tmp/test-project");
    setProjectRoot(null);
  });
});
