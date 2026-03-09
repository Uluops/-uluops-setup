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
} from "../lib/paths.js";

describe("path resolution", () => {
  it("getClaudeHome returns ~/.claude", () => {
    expect(getClaudeHome()).toBe(join(homedir(), ".claude"));
  });

  it("getClaudeJsonPath returns ~/.claude.json", () => {
    expect(getClaudeJsonPath()).toBe(join(homedir(), ".claude.json"));
  });

  it("getLocalMcpPath returns .mcp.json in cwd", () => {
    expect(getLocalMcpPath()).toBe(join(process.cwd(), ".mcp.json"));
  });

  it("getManifestPath returns ~/.claude/uluops-manifest.json", () => {
    expect(getManifestPath()).toBe(
      join(homedir(), ".claude", "uluops-manifest.json"),
    );
  });

  it("getAgentsDir returns ~/.claude/agents when not local", () => {
    expect(getAgentsDir(false)).toBe(join(homedir(), ".claude", "agents"));
  });

  it("getAgentsDir returns ./uluops/agents when local", () => {
    expect(getAgentsDir(true)).toBe(join(process.cwd(), "uluops", "agents"));
  });

  it("getCommandsDir returns ~/.claude/commands when not local", () => {
    expect(getCommandsDir(false)).toBe(join(homedir(), ".claude", "commands"));
  });

  it("getCommandsDir returns ./uluops/commands when local", () => {
    expect(getCommandsDir(true)).toBe(
      join(process.cwd(), "uluops", "commands"),
    );
  });
});
