/**
 * Agent Transform
 *
 * Transforms Claude Code agent markdown to other harness formats at install time.
 * Single source of truth: assets/agents/ contains Claude Code format only.
 * Each harness gets its frontmatter rewritten; the body is identical across all targets.
 */

// --- Frontmatter parsing ---

interface ParsedAgent {
  frontmatter: Record<string, string>;
  body: string;
}

function parseAgentMarkdown(markdown: string): ParsedAgent {
  const first = markdown.indexOf("---");
  if (first === -1) return { frontmatter: {}, body: markdown };
  const second = markdown.indexOf("---", first + 3);
  if (second === -1) return { frontmatter: {}, body: markdown };

  const fmBlock = markdown.substring(first + 3, second).trim();
  const body = markdown.substring(second + 3);

  const frontmatter: Record<string, string> = {};
  for (const line of fmBlock.split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.substring(0, colonIdx).trim();
    const value = line.substring(colonIdx + 1).trim();
    if (key) frontmatter[key] = value;
  }

  return { frontmatter, body };
}

// --- Tool mapping ---

const GEMINI_TOOL_MAP: Record<string, string> = {
  Read: "read_file",
  Grep: "grep_search",
  Glob: "glob",
  Bash: "run_shell_command",
};

const OPENCODE_PERMISSION_MAP: Record<string, { key: string; level: string }> = {
  Read: { key: "read", level: "allow" },
  Grep: { key: "grep", level: "allow" },
  Glob: { key: "glob", level: "allow" },
  Bash: { key: "bash", level: "ask" },
};

function parseToolsList(toolsStr: string): string[] {
  // Handle both "Read, Grep, Glob" and "[Read, Grep, Glob]" formats
  return toolsStr
    .replace(/^\[|\]$/g, "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

// --- Harness-specific frontmatter builders ---

function buildGeminiFrontmatter(fm: Record<string, string>): string {
  const lines: string[] = [];
  lines.push(`name: ${fm["name"] ?? "unknown"}`);

  const desc = fm["description"] ?? "";
  // Quote description if it contains YAML-special chars
  if (/[:#{}[\],&*?|>!%@`"']/.test(desc) || desc === "") {
    lines.push(`description: "${desc.replace(/"/g, '\\"')}"`);
  } else {
    lines.push(`description: ${desc}`);
  }

  lines.push("kind: local");

  // Map tools
  const tools = parseToolsList(fm["tools"] ?? "");
  const geminiTools = tools
    .map((t) => GEMINI_TOOL_MAP[t])
    .filter(Boolean);
  if (geminiTools.length > 0) {
    lines.push("tools:");
    for (const t of geminiTools) {
      lines.push(`  - ${t}`);
    }
  }

  lines.push("model: gemini-3-preview");
  lines.push("temperature: 0.2");
  lines.push("max_turns: 30");

  return lines.join("\n");
}

function buildOpenCodeFrontmatter(fm: Record<string, string>): string {
  const lines: string[] = [];
  lines.push(`name: ${fm["name"] ?? "unknown"}`);

  const desc = fm["description"] ?? "";
  if (/[:#{}[\],&*?|>!%@`"']/.test(desc) || desc === "") {
    lines.push(`description: "${desc.replace(/"/g, '\\"')}"`);
  } else {
    lines.push(`description: ${desc}`);
  }

  lines.push("mode: subagent");

  // Map tools to permissions
  const tools = parseToolsList(fm["tools"] ?? "");
  const permissions: Record<string, string> = {};
  for (const t of tools) {
    const mapping = OPENCODE_PERMISSION_MAP[t];
    if (mapping) permissions[mapping.key] = mapping.level;
  }
  if (Object.keys(permissions).length > 0) {
    permissions["list"] = "allow";
    lines.push("permission:");
    for (const [key, level] of Object.entries(permissions)) {
      lines.push(`  ${key}: ${level}`);
    }
  }

  lines.push("model: openai/gpt-5");

  return lines.join("\n");
}

// --- Public API ---

/**
 * Transform a Claude Code agent markdown file to a target harness format.
 * Returns the original content for claude-code; rewrites frontmatter for others.
 */
export function transformAgent(markdown: string, harnessName: string): string {
  if (harnessName === "claude-code") return markdown;

  const { frontmatter, body } = parseAgentMarkdown(markdown);

  let newFrontmatter: string;
  if (harnessName === "gemini-cli") {
    newFrontmatter = buildGeminiFrontmatter(frontmatter);
  } else if (harnessName === "opencode") {
    newFrontmatter = buildOpenCodeFrontmatter(frontmatter);
  } else {
    return markdown; // Unknown harness — pass through unchanged
  }

  return `---\n${newFrontmatter}\n---${body}`;
}
