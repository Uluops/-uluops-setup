import { describe, it, expect } from "vitest";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  getClaudeHome,
  getClaudeJsonPath,
  getLocalMcpPath,
  getManifestPath,
  getAgentsDir,
  getCommandsDir,
  findProjectRoot,
  setProjectRoot,
} from "../lib/paths.js";

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

  it("getAgentsDir returns ~/.claude/agents when not local", async () => {
    expect(await getAgentsDir(false)).toBe(join(homedir(), ".claude", "agents"));
  });

  it("getAgentsDir returns ./uluops/agents when local", async () => {
    const root = await findProjectRoot();
    expect(await getAgentsDir(true)).toBe(join(root, "uluops", "agents"));
  });

  it("getCommandsDir returns ~/.claude/commands when not local", async () => {
    expect(await getCommandsDir(false)).toBe(join(homedir(), ".claude", "commands"));
  });

  it("getCommandsDir returns ./uluops/commands when local", async () => {
    const root = await findProjectRoot();
    expect(await getCommandsDir(true)).toBe(
      join(root, "uluops", "commands"),
    );
  });

  it("setProjectRoot overrides findProjectRoot", async () => {
    setProjectRoot("/tmp/test-project");
    expect(await findProjectRoot()).toBe("/tmp/test-project");
    expect(await getAgentsDir(true)).toBe("/tmp/test-project/uluops/agents");
    setProjectRoot(null);
  });
});
