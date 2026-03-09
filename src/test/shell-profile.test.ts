import { describe, it, expect, vi, afterEach } from "vitest";
import { getShellProfile } from "../lib/paths.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getShellProfile", () => {
  it("returns .zshrc for zsh shell", () => {
    vi.stubEnv("SHELL", "/bin/zsh");
    const result = getShellProfile();
    expect(result).not.toBeNull();
    expect(result!.shell).toBe("zsh");
    expect(result!.path).toMatch(/\.zshrc$/);
  });

  it("returns .bashrc for bash on linux", () => {
    vi.stubEnv("SHELL", "/bin/bash");
    // getShellProfile checks platform() — on linux it returns .bashrc
    const result = getShellProfile();
    expect(result).not.toBeNull();
    expect(result!.shell).toBe("bash");
    // On linux: .bashrc, on darwin: .bash_profile
    expect(result!.path).toMatch(/\.bash(rc|_profile)$/);
  });

  it("returns config.fish for fish shell", () => {
    vi.stubEnv("SHELL", "/usr/bin/fish");
    const result = getShellProfile();
    expect(result).not.toBeNull();
    expect(result!.shell).toBe("fish");
    expect(result!.path).toMatch(/config\.fish$/);
  });

  it("returns null for unknown shell", () => {
    vi.stubEnv("SHELL", "/bin/csh");
    const result = getShellProfile();
    expect(result).toBeNull();
  });

  it("returns null when SHELL is empty", () => {
    vi.stubEnv("SHELL", "");
    const result = getShellProfile();
    expect(result).toBeNull();
  });
});
