import { readdir, access } from "node:fs/promises";
import { join } from "node:path";
import { loadManifest } from "../lib/manifest.js";
import { getHealthTimeout } from "../lib/health.js";
import { getProfile } from "../harnesses/index.js";

export interface VerifyResult {
  ok: boolean;
  checks: { label: string; passed: boolean; detail?: string }[];
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
    let profile;
    try {
      profile = getProfile(harnessName);
    } catch {
      checks.push({
        label: `Harness: ${harnessName}`,
        passed: false,
        detail: "Unknown harness in manifest",
      });
      allOk = false;
      continue;
    }

    // MCP config
    try {
      const config = await profile.mcpConfig.read(hm.mcpConfigPath);
      const hasMcp = profile.mcpConfig.check(config);
      if (hasMcp) {
        checks.push({
          label: `[${profile.displayName}] MCP config present in ${hm.mcpConfigPath} (2 servers)`,
          passed: true,
        });
      } else {
        checks.push({
          label: `[${profile.displayName}] MCP config`,
          passed: false,
          detail: "UluOps servers not found in config",
        });
        allOk = false;
      }
    } catch {
      checks.push({
        label: `[${profile.displayName}] MCP config`,
        passed: false,
        detail: `Cannot read ${hm.mcpConfigPath}`,
      });
      allOk = false;
    }

    // Agent files
    const agentsDir = join(hm.defsPath, "agents");
    try {
      const agentFiles = await readdir(agentsDir);
      const found = hm.agents.filter((a: string) =>
        agentFiles.includes(a),
      ).length;
      if (found === hm.agents.length) {
        checks.push({
          label: `[${profile.displayName}] ${found}/${hm.agents.length} agents in ${agentsDir}`,
          passed: true,
        });
      } else {
        checks.push({
          label: `[${profile.displayName}] ${found}/${hm.agents.length} agents in ${agentsDir}`,
          passed: false,
          detail: `Missing ${hm.agents.length - found} agent(s)`,
        });
        allOk = false;
      }
    } catch {
      checks.push({
        label: `[${profile.displayName}] Agent files`,
        passed: false,
        detail: `Directory not found: ${agentsDir}`,
      });
      allOk = false;
    }

    // Command files
    if (hm.commands.length > 0) {
      const commandsDir = join(hm.defsPath, "commands");
      let found = 0;
      for (const cmd of hm.commands) {
        try {
          await access(join(commandsDir, cmd));
          found++;
        } catch {
          // Missing
        }
      }
      if (found === hm.commands.length) {
        checks.push({
          label: `[${profile.displayName}] ${found}/${hm.commands.length} commands`,
          passed: true,
        });
      } else {
        checks.push({
          label: `[${profile.displayName}] ${found}/${hm.commands.length} commands`,
          passed: false,
          detail: `Missing ${hm.commands.length - found} command(s)`,
        });
        allOk = false;
      }
    }

    // Hooks
    if (hm.hooksInstalled && profile.hooks && profile.paths.settingsPath) {
      const hookPresent = await profile.hooks.check(
        profile.paths.settingsPath,
      );
      let hookFilePresent = false;
      if (profile.paths.toolsDir) {
        try {
          await access(join(profile.paths.toolsDir, "dist", "hook.js"));
          hookFilePresent = true;
        } catch {
          // Missing
        }
      }

      if (hookPresent && hookFilePresent) {
        checks.push({
          label: `[${profile.displayName}] Agent metrics hook configured`,
          passed: true,
        });
      } else {
        const missing = [
          !hookPresent && "hook not in settings",
          !hookFilePresent && "hook.js not found",
        ]
          .filter(Boolean)
          .join(", ");
        checks.push({
          label: `[${profile.displayName}] Agent metrics`,
          passed: false,
          detail: missing,
        });
        allOk = false;
      }
    }
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
