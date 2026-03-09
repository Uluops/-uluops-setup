import { describe, it, expect } from "vitest";
import { detect } from "../steps/detect.js";

describe("detect", () => {
  it("returns a valid Environment object", async () => {
    const env = await detect();
    expect(env).toHaveProperty("os");
    expect(env).toHaveProperty("isWsl");
    expect(env).toHaveProperty("shell");
    expect(env).toHaveProperty("shellProfile");
    expect(env).toHaveProperty("nodeVersion");
    expect(env).toHaveProperty("claudeHomeExists");
  });

  it("nodeVersion matches process.version", async () => {
    const env = await detect();
    expect(env.nodeVersion).toBe(process.version);
  });

  it("os is one of the supported platforms", async () => {
    const env = await detect();
    expect(["linux", "darwin", "win32"]).toContain(env.os);
  });

  it("claudeHomeExists is a boolean", async () => {
    const env = await detect();
    expect(typeof env.claudeHomeExists).toBe("boolean");
  });
});
