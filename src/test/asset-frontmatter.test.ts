import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { ASSETS_DIR } from "../lib/paths.js";

/**
 * Recursively enumerate every `.md` file under `assets/`. Bundled assets
 * are what `@uluops/setup` copies verbatim into every user's harness home
 * (Claude Code agents, Codex skills, Gemini commands, etc.), so a malformed
 * frontmatter block ships directly into production harness configs and
 * silently disables the asset on harness startup.
 */
function listMarkdownFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...listMarkdownFiles(full));
    } else if (entry.endsWith(".md")) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Extract the YAML frontmatter block (between the first two `---`
 * delimiters) from a markdown file. Returns null when no frontmatter is
 * present — not every bundled `.md` carries one (e.g. README excerpts).
 */
function extractFrontmatter(content: string): string | null {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  return match?.[1] ?? null;
}

/**
 * Count the colons on a frontmatter line OUTSIDE of any quoted span.
 * Walks the line stripping anything inside `"..."` or `'...'` (handling
 * the trivial escape `\"` / `\'` cases) before counting.
 *
 * Why not just call a YAML parser: every YAML lib carries its own
 * lookalike-bug surface, and pulling one in just for this test bloats the
 * dependency footprint of a CLI installer. The structural property the
 * Codex parser cares about (every frontmatter line has exactly one
 * top-level colon unless multi-colon values are quoted) is well-modeled
 * by this 6-line helper, and the regression coverage we need is on the
 * specific failure mode that surfaced — unquoted multi-colon strings —
 * not on full YAML correctness.
 */
function countUnquotedColons(line: string): number {
  const stripped = line
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/'(?:\\.|[^'\\])*'/g, "''");
  return (stripped.match(/:/g) || []).length;
}

describe("bundled asset frontmatter", () => {
  /**
   * Regression for the 2026-06-07 Codex startup failure: every user who
   * upgraded to `@uluops/setup` ≤ 0.9.3 received a `~/.codex/skills/
   * uluops-operator/SKILL.md` whose `description:` line contained an
   * unquoted second colon ("Codex: using UluOps MCP tools…"). The YAML
   * parser inside Codex's skill loader treated the second colon as a
   * nested mapping separator, threw `mapping values are not allowed in
   * this context at line 2`, and skipped the skill silently. The harness
   * launched fine but the operator skill was invisible — a category of
   * failure that the install summary's `✓ 1 skills → ~/.codex/skills/`
   * line actively masked.
   *
   * The structural property: every YAML frontmatter line must have
   * exactly one top-level colon (the key/value separator) — additional
   * colons inside the value must be wrapped in single or double quotes.
   * This test enumerates every bundled `.md` under `assets/`, extracts
   * its frontmatter, and asserts the property holds. New asset additions
   * are covered for free.
   */
  it("never ships unquoted multi-colon lines in any bundled markdown's frontmatter", () => {
    const offenders: string[] = [];

    for (const file of listMarkdownFiles(ASSETS_DIR)) {
      const fm = extractFrontmatter(readFileSync(file, "utf-8"));
      if (fm === null) continue;

      for (const [i, line] of fm.split("\n").entries()) {
        if (!line.includes(":")) continue;
        if (countUnquotedColons(line) > 1) {
          offenders.push(
            `${relative(ASSETS_DIR, file)}:${i + 2}: ${line.trim()}`,
          );
        }
      }
    }

    expect(
      offenders,
      `Bundled markdown files contain unquoted multi-colon frontmatter ` +
        `lines. YAML parsers reject these with "mapping values are not ` +
        `allowed in this context" and the asset is silently skipped on ` +
        `harness startup. Wrap the value in double quotes to fix.\n\n` +
        offenders.join("\n"),
    ).toEqual([]);
  });
});
