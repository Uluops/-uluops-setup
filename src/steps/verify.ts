import { readdir, access } from "node:fs/promises";
import { join } from "node:path";
import { loadManifest, type HarnessManifest } from "../lib/manifest.js";
import { getHealthTimeout } from "../lib/health.js";
import { getProfile } from "../harnesses/index.js";

export interface VerifyResult {
  ok: boolean;
  checks: { label: string; passed: boolean; detail?: string }[];
}

/** Verify a single harness entry, appending results to checks. Returns false if any check fails. */
async function verifyHarness(
  harnessName: string,
  hm: HarnessManifest,
  checks: VerifyResult["checks"],
): Promise<boolean> {
  let allOk = true;

  let profile;
  try {
    profile = getProfile(harnessName);
  } catch {
    checks.push({ label: `Harness: ${harnessName}`, passed: false, detail: "Unknown harness in manifest" });
    return false;
  }

  // MCP config
  try {
    const config = await profile.mcpConfig.read(hm.mcpConfigPath);
    if (profile.mcpConfig.check(config)) {
      checks.push({ label: `[${profile.displayName}] MCP config present in ${hm.mcpConfigPath} (2 servers)`, passed: true });
    } else {
      checks.push({ label: `[${profile.displayName}] MCP config`, passed: false, detail: "UluOps servers not found in config" });
      allOk = false;
    }
  } catch {
    checks.push({ label: `[${profile.displayName}] MCP config`, passed: false, detail: `Cannot read ${hm.mcpConfigPath}` });
    allOk = false;
  }

  // Agent files
  const agentsDir = join(hm.defsPath, "agents");
  try {
    const agentFiles = await readdir(agentsDir);
    const found = hm.agents.filter((a: string) => agentFiles.includes(a)).length;
    checks.push({
      label: `[${profile.displayName}] ${found}/${hm.agents.length} agents in ${agentsDir}`,
      passed: found === hm.agents.length,
      detail: found < hm.agents.length ? `Missing ${hm.agents.length - found} agent(s)` : undefined,
    });
    if (found < hm.agents.length) allOk = false;
  } catch {
    checks.push({ label: `[${profile.displayName}] Agent files`, passed: false, detail: `Directory not found: ${agentsDir}` });
    allOk = false;
  }

  // Command files
  if (hm.commands.length > 0) {
    const commandsDir = join(hm.defsPath, "commands");
    let found = 0;
    for (const cmd of hm.commands) {
      try { await access(join(commandsDir, cmd)); found++; } catch { /* Missing */ }
    }
    checks.push({
      label: `[${profile.displayName}] ${found}/${hm.commands.length} commands`,
      passed: found === hm.commands.length,
      detail: found < hm.commands.length ? `Missing ${hm.commands.length - found} command(s)` : undefined,
    });
    if (found < hm.commands.length) allOk = false;
  }

  // Hooks
  if (hm.hooksInstalled && profile.hooks && profile.paths.settingsPath) {
    const hookPresent = await profile.hooks.check(profile.paths.settingsPath);
    let hookFilePresent = false;
    if (profile.paths.toolsDir) {
      try { await access(join(profile.paths.toolsDir, "dist", "hook.js")); hookFilePresent = true; } catch { /* Missing */ }
    }
    if (hookPresent && hookFilePresent) {
      checks.push({ label: `[${profile.displayName}] Agent metrics hook configured`, passed: true });
    } else {
      const missing = [!hookPresent && "hook not in settings", !hookFilePresent && "hook.js not found"].filter(Boolean).join(", ");
      checks.push({ label: `[${profile.displayName}] Agent metrics`, passed: false, detail: missing });
      allOk = false;
    }
  }

  return allOk;
}

/** Run all verification checks against the current installation and return structured results. */
export async function verify(): Promise<VerifyResult> {
  const checks: VerifyResult["checks"] = [];
  let allOk = true;

  // 1. Manifest
  const manifest = await loadManifest();
  if (!manifest) {
    checks.push({
      label: "Manifest found",
      passed: false,
      detail: "No manifest — run npx @uluops/setup first",
    });
    return { ok: false, checks };
  }
  checks.push({
    label: `Manifest found (v${manifest.version}, installed ${manifest.installedAt.split("T")[0]})`,
    passed: true,
  });

  // 2. Per-harness checks
  for (const [harnessName, hm] of Object.entries(manifest.harnesses)) {
    const ok = await verifyHarness(harnessName, hm, checks);
    if (!ok) allOk = false;
  }

  // 3. API connectivity (harness-agnostic)
  const apiKey = process.env["ULUOPS_API_KEY"];
  if (apiKey) {
    try {
      const res = await fetch(
        "https://api.uluops.ai/api/v1/registry/users/me",
        {
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(getHealthTimeout()),
        },
      );
      if (res.ok) {
        const data = (await res.json()) as { email?: string };
        checks.push({
          label: `API key valid${data.email ? ` (user: ${data.email})` : ""}`,
          passed: true,
        });
      } else {
        checks.push({
          label: "API key valid",
          passed: false,
          detail: `Server returned ${res.status}`,
        });
        allOk = false;
      }
    } catch {
      checks.push({
        label: "API connectivity",
        passed: false,
        detail: "Can't reach api.uluops.ai",
      });
      allOk = false;
    }
  }

  return { ok: allOk, checks };
}
