import { readdir, access } from "node:fs/promises";
import { join } from "node:path";
import { loadManifest } from "../lib/manifest.js";
import { readConfig } from "../lib/config-merger.js";
import { readSettings, hasUluopsHook } from "../lib/settings-merger.js";
import { getMetricsToolDir, getSettingsPath } from "./metrics.js";

function getHealthTimeout(): number {
  const env = process.env["ULUOPS_HEALTH_TIMEOUT"];
  if (env) {
    const ms = Number(env);
    if (Number.isFinite(ms) && ms > 0) return ms;
  }
  return 10_000;
}

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

  // 2. MCP config
  const config = await readConfig(manifest.mcpConfigPath);
  const hasTracker = !!config.mcpServers?.["uluops-tracker"];
  const hasRegistry = !!config.mcpServers?.["uluops-registry"];
  if (hasTracker && hasRegistry) {
    checks.push({
      label: `MCP config present in ${manifest.mcpConfigPath} (2 servers)`,
      passed: true,
    });
  } else {
    checks.push({
      label: "MCP config",
      passed: false,
      detail: `Missing: ${[!hasTracker && "tracker", !hasRegistry && "registry"].filter(Boolean).join(", ")}`,
    });
    allOk = false;
  }

  // 3. Agent files
  const agentsDir = join(manifest.defsPath, "agents");
  try {
    const agentFiles = await readdir(agentsDir);
    const found = manifest.agents.filter((a) => agentFiles.includes(a)).length;
    if (found === manifest.agents.length) {
      checks.push({
        label: `${found}/${manifest.agents.length} agents in ${agentsDir}`,
        passed: true,
      });
    } else {
      checks.push({
        label: `${found}/${manifest.agents.length} agents in ${agentsDir}`,
        passed: false,
        detail: `Missing ${manifest.agents.length - found} agent(s)`,
      });
      allOk = false;
    }
  } catch {
    checks.push({
      label: "Agent files",
      passed: false,
      detail: `Directory not found: ${agentsDir}`,
    });
    allOk = false;
  }

  // 4. Command files
  const commandsDir = join(manifest.defsPath, "commands");
  try {
    let found = 0;
    for (const cmd of manifest.commands) {
      try {
        await access(join(commandsDir, cmd));
        found++;
      } catch {
        // Missing
      }
    }
    if (found === manifest.commands.length) {
      checks.push({
        label: `${found}/${manifest.commands.length} commands in ${commandsDir}`,
        passed: true,
      });
    } else {
      checks.push({
        label: `${found}/${manifest.commands.length} commands in ${commandsDir}`,
        passed: false,
        detail: `Missing ${manifest.commands.length - found} command(s)`,
      });
      allOk = false;
    }
  } catch {
    checks.push({
      label: "Command files",
      passed: false,
      detail: `Directory not found: ${commandsDir}`,
    });
    allOk = false;
  }

  // 5. Agent metrics hook
  if (manifest.metricsHookInstalled) {
    const settings = await readSettings(getSettingsPath());
    const hookPresent = hasUluopsHook(settings);
    const toolDir = getMetricsToolDir();
    let hookFilePresent = false;
    try {
      await access(join(toolDir, "dist", "hook.js"));
      hookFilePresent = true;
    } catch {
      // Missing
    }

    if (hookPresent && hookFilePresent) {
      checks.push({
        label: "Agent metrics hook configured and tool files present",
        passed: true,
      });
    } else {
      const missing = [
        !hookPresent && "hook not in settings.json",
        !hookFilePresent && "hook.js not found",
      ]
        .filter(Boolean)
        .join(", ");
      checks.push({
        label: "Agent metrics",
        passed: false,
        detail: missing,
      });
      allOk = false;
    }
  }

  // 6. API connectivity
  const apiKey = extractApiKey(config);
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

function extractApiKey(
  config: Record<string, unknown>,
): string | undefined {
  const raw = config.mcpServers;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return process.env["ULUOPS_API_KEY"];
  }
  const servers = raw as Record<string, { env?: Record<string, string> }>;
  return (
    servers["uluops-registry"]?.env?.["ULUOPS_API_KEY"] ??
    servers["uluops-tracker"]?.env?.["ULUOPS_TRACKER_API_KEY"] ??
    process.env["ULUOPS_API_KEY"]
  );
}
