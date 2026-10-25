import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Run the source entry point through tsx: tests run before `build` in
// prepublishOnly, so dist/ may be absent or stale.
const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function help(): string {
  const r = spawnSync(process.execPath, ["--import", "tsx", "src/cli.ts", "--help"], {
    cwd: pkgRoot,
    encoding: "utf-8",
    env: { ...process.env, COLUMNS: "200" },
    timeout: 30_000,
  });
  expect(r.status).toBe(0);
  return r.stdout.replace(/\s+/g, " ");
}

describe("--help", () => {
  it("describes the harness default as auto-detection, not claude-code", () => {
    const text = help();
    expect(text).toContain("(default: auto-detect; claude-code when none is detected)");
    expect(text).not.toContain('(default: "claude-code")');
  });

  it("names the per-harness local-defs folder", () => {
    expect(help()).toContain("./uluops/<harness>/");
  });
});
