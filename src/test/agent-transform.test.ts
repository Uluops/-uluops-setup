import { describe, it, expect } from "vitest";
import { transformAgent } from "../lib/agent-transform.js";

const sampleAgent = `---
name: code-validator
version: "1.5.0"
description: Validates code quality after implementation phases.

tools: Read, Grep, Glob, Bash
model: sonnet
threshold: 70
---

You are a strict code validator.

## Your Mission

Provide a **PASS/FAIL** decision.
`;

const agentWithSpecialDesc = `---
name: test-agent
description: Tests "things" & checks: stuff
tools: Read, Grep
model: opus
---

Body here.
`;

describe("transformAgent", () => {
  describe("claude-code (passthrough)", () => {
    it("returns original content unchanged", () => {
      expect(transformAgent(sampleAgent, "claude-code")).toBe(sampleAgent);
    });
  });

  describe("gemini-cli", () => {
    it("rewrites frontmatter with Gemini-specific fields", () => {
      const result = transformAgent(sampleAgent, "gemini-cli");

      expect(result).toContain("name: code-validator");
      expect(result).toContain("kind: local");
      expect(result).toContain("model: gemini-3-preview");
      expect(result).toContain("temperature: 0.2");
      expect(result).toContain("max_turns: 30");
    });

    it("maps tools to Gemini names", () => {
      const result = transformAgent(sampleAgent, "gemini-cli");

      expect(result).toContain("- read_file");
      expect(result).toContain("- grep_search");
      expect(result).toContain("- glob");
      expect(result).toContain("- run_shell_command");
      expect(result).not.toContain("- Read");
    });

    it("strips Claude-specific fields", () => {
      const result = transformAgent(sampleAgent, "gemini-cli");

      expect(result).not.toContain("model: sonnet");
      expect(result).not.toContain("threshold:");
    });

    it("preserves body unchanged", () => {
      const result = transformAgent(sampleAgent, "gemini-cli");

      expect(result).toContain("You are a strict code validator.");
      expect(result).toContain("## Your Mission");
      expect(result).toContain("**PASS/FAIL**");
    });

    it("quotes description with special characters", () => {
      const result = transformAgent(agentWithSpecialDesc, "gemini-cli");

      expect(result).toMatch(/description: ".*things.*"/);
    });
  });

  describe("opencode", () => {
    it("rewrites frontmatter with OpenCode-specific fields", () => {
      const result = transformAgent(sampleAgent, "opencode");

      expect(result).toContain("name: code-validator");
      expect(result).toContain("mode: subagent");
      expect(result).toContain("model: openai/gpt-5");
    });

    it("maps tools to permission entries", () => {
      const result = transformAgent(sampleAgent, "opencode");

      expect(result).toContain("permission:");
      expect(result).toContain("read: allow");
      expect(result).toContain("grep: allow");
      expect(result).toContain("glob: allow");
      expect(result).toContain("bash: ask");
      expect(result).toContain("list: allow");
    });

    it("preserves body unchanged", () => {
      const result = transformAgent(sampleAgent, "opencode");

      expect(result).toContain("You are a strict code validator.");
      expect(result).toContain("## Your Mission");
    });
  });

  describe("unknown harness", () => {
    it("returns original content unchanged", () => {
      expect(transformAgent(sampleAgent, "unknown-harness")).toBe(sampleAgent);
    });
  });
});
