import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, readFile, readdir, realpath } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const prompts = vi.hoisted(() => ({ confirm: vi.fn() }));
vi.mock("@inquirer/prompts", () => ({ confirm: prompts.confirm }));

import { findProjectRoot, setProjectRoot, localDefsRoot } from "../lib/paths.js";
import { installAgents } from "../steps/agents.js";
import { checkConflicts, installCommandsDefs } from "../commands/helpers.js";
import { ConflictRejectedError } from "../commands/errors.js";
import { getProfile } from "../harnesses/index.js";

let tmp: string;

beforeEach(async () => {
  // realpath: on macOS tmpdir() is a /var → /private/var symlink, and the
  // walk compares real directory names.
  tmp = await realpath(await mkdtemp(join(tmpdir(), "uluops-local-defs-")));
  vi.stubEnv("ULUOPS_PROJECT_ROOT", "");
  prompts.confirm.mockReset();
});

afterEach(() => {
  setProjectRoot(null);
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("findProjectRoot", () => {
  it("walks more than one level up to the repo root", async () => {
    await mkdir(join(tmp, ".git"));
    const deep = join(tmp, "a", "b", "c");
    await mkdir(deep, { recursive: true });
    vi.spyOn(process, "cwd").mockReturnValue(deep);

    expect(await findProjectRoot()).toBe(tmp);
  });

  it("still finds a marker in cwd itself", async () => {
    await writeFile(join(tmp, "package.json"), "{}");
    vi.spyOn(process, "cwd").mockReturnValue(tmp);

    expect(await findProjectRoot()).toBe(tmp);
  });

  it("falls back to cwd when no directory up to the filesystem root has a marker", async () => {
    const deep = join(tmp, "x", "y");
    await mkdir(deep, { recursive: true });
    vi.spyOn(process, "cwd").mockReturnValue(deep);

    // Precondition: nothing above tmp is a project, or this proves nothing.
    // (tmpdir() on macOS/Linux has no .git or package.json above it.)
    expect(await findProjectRoot()).toBe(deep);
  });
});

describe("per-harness --local-defs layout", () => {
  it("localDefsRoot is <project>/uluops/<harness>", async () => {
    setProjectRoot(tmp);
    expect(await localDefsRoot("codex")).toBe(join(tmp, "uluops", "codex"));
  });

  it("two harnesses installed locally keep their own agent files", async () => {
    setProjectRoot(tmp);
    await installAgents(getProfile("claude-code"), true, false);
    await installAgents(getProfile("gemini-cli"), true, false);

    const claudeDir = join(tmp, "uluops", "claude-code", "agents");
    const geminiDir = join(tmp, "uluops", "gemini-cli", "agents");
    const claudeFiles = await readdir(claudeDir);
    expect(claudeFiles.length).toBeGreaterThan(0);
    expect(await readdir(geminiDir)).toEqual(claudeFiles);

    // The harnesses ship the same names rendered differently: in a shared
    // tree the second install overwrote the first, so the two copies of
    // one name must still differ.
    const name = claudeFiles[0]!;
    const claude = await readFile(join(claudeDir, name), "utf-8");
    const gemini = await readFile(join(geminiDir, name), "utf-8");
    expect(claude).not.toBe(gemini);
  });
});

describe("checkConflicts covers every surface setup writes", () => {
  async function shippedCommand(): Promise<string> {
    const { ASSETS_DIR } = await import("../lib/paths.js");
    const files = await readdir(join(ASSETS_DIR, "claude-code", "commands", "agents"));
    expect(files.length).toBeGreaterThan(0);
    return files[0]!;
  }

  it("prompts before overwriting a user's own command with a shipped name", async () => {
    setProjectRoot(tmp);
    const name = await shippedCommand();
    const dest = join(tmp, "uluops", "claude-code", "commands", "agents");
    await mkdir(dest, { recursive: true });
    await writeFile(join(dest, name), "my own command");
    prompts.confirm.mockResolvedValue(false);
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    await expect(checkConflicts(getProfile("claude-code"), true)).rejects.toBeInstanceOf(
      ConflictRejectedError,
    );
    expect(prompts.confirm).toHaveBeenCalledTimes(1);
  });

  it("does not prompt when nothing would be overwritten", async () => {
    setProjectRoot(tmp);
    await checkConflicts(getProfile("claude-code"), true);
    expect(prompts.confirm).not.toHaveBeenCalled();
  });
});

describe("harnesses without slash commands", () => {
  it("Codex names the skill that replaces commands, not 'coming soon'", async () => {
    setProjectRoot(tmp);
    const spy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    await installCommandsDefs(getProfile("codex"), { localDefs: true, dryRun: true });
    // eslint-disable-next-line no-control-regex
    const text = spy.mock.calls.map((c) => String(c[0]).replace(/\u001b\[[0-9;]*m/g, "")).join("\n");
    expect(text).toContain("No slash commands for Codex — the uluops skill covers the workflows instead");
    expect(text).not.toContain("coming soon");
  });

  it("OpenCode says no commands ship, not 'coming soon'", async () => {
    setProjectRoot(tmp);
    const spy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    await installCommandsDefs(getProfile("opencode"), { localDefs: true, dryRun: true });
    // eslint-disable-next-line no-control-regex
    const text = spy.mock.calls.map((c) => String(c[0]).replace(/\u001b\[[0-9;]*m/g, "")).join("\n");
    expect(text).toContain("No slash commands ship for OpenCode");
    expect(text).not.toContain("coming soon");
  });
});
