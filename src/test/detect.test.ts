import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// These mocks must be hoisted above the `detect` import so the static module
// graph picks them up. Each test resets the mock factories via vi.mocked()
// rather than re-mocking, which keeps the module graph stable.
vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>();
  return {
    ...actual,
    platform: vi.fn(() => "linux"),
    release: vi.fn(() => "5.15.0-generic"),
  };
});

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    access: vi.fn(() => Promise.resolve()),
  };
});

vi.mock("../harnesses/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../harnesses/index.js")>();
  return {
    ...actual,
    detectHarnesses: vi.fn(() => []),
  };
});

vi.mock("../lib/paths.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/paths.js")>();
  return {
    ...actual,
    getClaudeHome: vi.fn(() => "/fake/.claude"),
    getShellProfile: vi.fn(() => ({ shell: "zsh", path: "/fake/.zshrc" })),
  };
});

import { detect } from "../steps/detect.js";
import { platform, release } from "node:os";
import { access } from "node:fs/promises";
import { detectHarnesses } from "../harnesses/index.js";

// process.version is read-only; stub it via Object.defineProperty per test.
const realNodeVersion = process.version;

beforeEach(() => {
  vi.mocked(platform).mockReturnValue("linux");
  vi.mocked(release).mockReturnValue("5.15.0-generic");
  vi.mocked(access).mockResolvedValue(undefined);
  vi.mocked(detectHarnesses).mockReturnValue([]);
  Object.defineProperty(process, "version", {
    value: "v20.10.0",
    configurable: true,
  });
});

afterEach(() => {
  Object.defineProperty(process, "version", {
    value: realNodeVersion,
    configurable: true,
  });
});

describe("detect — platform behavior", () => {
  it("rejects unsupported platform with a descriptive error", async () => {
    vi.mocked(platform).mockReturnValue("aix" as NodeJS.Platform);
    await expect(detect()).rejects.toThrow(/Unsupported platform: aix/);
  });

  it("rejects Windows with a WSL2 hint", async () => {
    vi.mocked(platform).mockReturnValue("win32");
    await expect(detect()).rejects.toThrow(/WSL2/);
  });

  it("returns os=linux for native Linux", async () => {
    vi.mocked(platform).mockReturnValue("linux");
    const env = await detect();
    expect(env.os).toBe("linux");
    expect(env.isWsl).toBe(false);
  });

  it("returns os=darwin for macOS", async () => {
    vi.mocked(platform).mockReturnValue("darwin");
    const env = await detect();
    expect(env.os).toBe("darwin");
  });
});

describe("detect — WSL detection", () => {
  // The detector flags WSL as linux + a release string containing "microsoft".
  // This is the only branch that derives behavior from os.release(), so it
  // gets its own test.

  it("flags isWsl=true when linux release string contains 'microsoft'", async () => {
    vi.mocked(platform).mockReturnValue("linux");
    vi.mocked(release).mockReturnValue("5.15.146.1-microsoft-standard-WSL2");
    const env = await detect();
    expect(env.isWsl).toBe(true);
  });

  it("flags isWsl=false on darwin even if release contains 'microsoft'", async () => {
    vi.mocked(platform).mockReturnValue("darwin");
    vi.mocked(release).mockReturnValue("microsoft-something");
    const env = await detect();
    expect(env.isWsl).toBe(false);
  });

  it("is case-insensitive on the 'microsoft' marker", async () => {
    vi.mocked(platform).mockReturnValue("linux");
    vi.mocked(release).mockReturnValue("5.15-MICROSOFT-WSL2");
    const env = await detect();
    expect(env.isWsl).toBe(true);
  });
});

describe("detect — Node version gate", () => {
  it("rejects Node 18", async () => {
    Object.defineProperty(process, "version", {
      value: "v18.19.0",
      configurable: true,
    });
    await expect(detect()).rejects.toThrow(/Node\.js 20 or higher/);
  });

  it("accepts Node 20", async () => {
    Object.defineProperty(process, "version", {
      value: "v20.0.0",
      configurable: true,
    });
    const env = await detect();
    expect(env.nodeVersion).toBe("v20.0.0");
  });

  it("accepts Node 22", async () => {
    Object.defineProperty(process, "version", {
      value: "v22.5.1",
      configurable: true,
    });
    const env = await detect();
    expect(env.nodeVersion).toBe("v22.5.1");
  });

  it("documents latent bug: corrupt process.version silently passes the gate", async () => {
    // `parseInt('BOGUS', 10)` is NaN and `NaN < 20` is false, so detect()
    // doesn't reject on a corrupt version string. This is a latent bug — a
    // future change should add `Number.isNaN(majorVersion)` to the guard.
    // Pinning current behavior so the fix has to flip this assertion
    // deliberately rather than slipping through unnoticed.
    Object.defineProperty(process, "version", {
      value: "vBOGUS",
      configurable: true,
    });
    const env = await detect();
    expect(env.nodeVersion).toBe("vBOGUS");
  });
});

describe("detect — claudeHomeExists probe", () => {
  it("returns claudeHomeExists=true when fs.access resolves", async () => {
    vi.mocked(access).mockResolvedValue(undefined);
    const env = await detect();
    expect(env.claudeHomeExists).toBe(true);
  });

  it("returns claudeHomeExists=false when fs.access rejects (ENOENT)", async () => {
    vi.mocked(access).mockRejectedValue(
      Object.assign(new Error("ENOENT"), { code: "ENOENT" }),
    );
    const env = await detect();
    expect(env.claudeHomeExists).toBe(false);
  });

  it("returns claudeHomeExists=false on any other fs error (EACCES)", async () => {
    vi.mocked(access).mockRejectedValue(
      Object.assign(new Error("EACCES"), { code: "EACCES" }),
    );
    const env = await detect();
    // The detector treats any access failure as "doesn't exist"; documenting
    // that here. If we ever distinguish ENOENT from permission errors, this
    // assertion will need to flip.
    expect(env.claudeHomeExists).toBe(false);
  });
});

describe("detect — harness composition", () => {
  it("passes through whatever detectHarnesses returns", async () => {
    const stub = [
      { name: "claude-code", displayName: "Claude Code" },
      { name: "opencode", displayName: "OpenCode" },
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(detectHarnesses).mockReturnValue(stub as any);
    const env = await detect();
    expect(env.detectedHarnesses).toEqual(stub);
  });
});
