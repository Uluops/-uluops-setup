import { readFile, readdir, mkdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import type { HarnessProfile } from "../harnesses/index.js";
import { ASSETS_DIR, findProjectRoot } from "../lib/paths.js";
import { copyIfChanged, writeIfChanged } from "../lib/file-ops.js";

export interface CommandsResult {
  agentCommands: number;
  workflowCommands: number;
  pipelineCommands: number;
  skipped: number;
  removed: number;
  files: string[];
  skippedReason?: string;
}

const SUBDIRS = ["agents", "workflows", "pipelines"] as const;

/** Harnesses that support command installation. */
const SUPPORTED_HARNESSES = new Set(["claude-code", "gemini-cli"]);

// --- Gemini CLI transform ---

/**
 * Strip YAML frontmatter from rendered markdown, returning just the body.
 */
function stripFrontmatter(markdown: string): string {
  const first = markdown.indexOf("---");
  if (first === -1) return markdown;
  const second = markdown.indexOf("---", first + 3);
  if (second === -1) return markdown;
  return markdown.substring(second + 3);
}

/**
 * Escape a string for use in a TOML basic string (double-quoted).
 */
function escapeToml(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t");
}

/**
 * Transform a Claude Code markdown command to a Gemini CLI TOML command.
 * Strips frontmatter, substitutes $ARGUMENTS → {{args}}, wraps in TOML.
 */
function transformToGeminiToml(markdown: string, description: string): string {
  const body = stripFrontmatter(markdown)
    .replace(/\$ARGUMENTS/g, "{{args}}")
    .trim();

  // Escape """ in body for TOML multi-line strings
  const escaped = body.replace(/"""/g, '""\\"');

  return `description = "${escapeToml(description)}"\nprompt = """\n${escaped}\n"""\n`;
}

/**
 * Extract the description from a markdown command's YAML frontmatter.
 */
function extractDescription(markdown: string): string {
  const match = markdown.match(/^description:\s*(.+)$/m);
  return match?.[1]?.trim() ?? "";
}

// --- Install ---

/** Install slash-command files, transforming to target format as needed. */
export async function installCommands(
  profile: HarnessProfile,
  localDefs: boolean,
  dryRun: boolean,
  existingManifestCommands?: string[],
): Promise<CommandsResult> {
  if (!SUPPORTED_HARNESSES.has(profile.name)) {
    return {
      agentCommands: 0,
      workflowCommands: 0,
      pipelineCommands: 0,
      skipped: 0,
      removed: 0,
      files: [],
      skippedReason: "not-supported",
    };
  }

  const srcBase = join(ASSETS_DIR, "commands");
  const destBase = localDefs
    ? join(await findProjectRoot(), "uluops", "commands")
    : profile.paths.commandsDir;

  const needsTransform = profile.name === "gemini-cli";

  let agentCommands = 0;
  let workflowCommands = 0;
  let pipelineCommands = 0;
  let skipped = 0;
  const allFiles: string[] = [];

  for (const subdir of SUBDIRS) {
    const srcDir = join(srcBase, subdir);
    const destDir = join(destBase, subdir);

    if (!dryRun) {
      await mkdir(destDir, { recursive: true });
    }

    let files: string[];
    try {
      files = (await readdir(srcDir)).filter((f) => f.endsWith(".md"));
    } catch {
      continue;
    }

    for (const file of files) {
      const destFile = needsTransform
        ? file.replace(/\.md$/, ".toml")
        : file;
      const relativePath = `${subdir}/${destFile}`;

      let result: "copied" | "skipped";
      if (needsTransform) {
        const markdown = await readFile(join(srcDir, file), "utf-8");
        const description = extractDescription(markdown);
        const toml = transformToGeminiToml(markdown, description);
        result = await writeIfChanged(join(destDir, destFile), toml, dryRun);
      } else {
        result = await copyIfChanged(
          join(srcDir, file),
          join(destDir, destFile),
          dryRun,
        );
      }

      if (result === "copied") {
        if (subdir === "agents") agentCommands++;
        else if (subdir === "workflows") workflowCommands++;
        else pipelineCommands++;
      } else {
        skipped++;
      }

      allFiles.push(relativePath);
    }
  }

  // Remove files that were in the old manifest but no longer in the package
  let removed = 0;
  if (existingManifestCommands) {
    for (const oldFile of existingManifestCommands) {
      if (!allFiles.includes(oldFile)) {
        if (!dryRun) {
          try {
            await unlink(join(destBase, oldFile));
          } catch {
            // Already gone
          }
        }
        removed++;
      }
    }
  }

  return {
    agentCommands,
    workflowCommands,
    pipelineCommands,
    skipped,
    removed,
    files: allFiles,
  };
}

/** Remove previously installed command files by relative path. Returns count of successfully removed files. */
export async function uninstallCommands(
  files: string[],
  defsPath: string,
): Promise<number> {
  const { unlinkFiles } = await import("../lib/file-ops.js");
  return unlinkFiles(join(defsPath, "commands"), files);
}
