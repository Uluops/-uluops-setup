import { readdir, access, stat } from "node:fs/promises";
import { join } from "node:path";
import { loadManifest, type HarnessManifest } from "../lib/manifest.js";
import { getHealthTimeout } from "../lib/health.js";
import { getProfile } from "../harnesses/index.js";
import { readInstalledMetricsVersion } from "./metrics.js";

export interface VerifyResult {
  ok: boolean;
  checks: { label: string; passed: boolean; detail?: string }[];
}

type HarnessProfileLike = ReturnType<typeof getProfile>;
type CheckList = VerifyResult["checks"];

/**
 * Readiness probe: did the harness pick up the config after install?
 * The proxy signal is `configFile.mtimeMs > installedAt + 100ms` — a config
 * touched after install means the harness wrote it back during startup.
 * Always passes (true) — readiness state is reported in `detail`, not the
 * boolean — so the caller never fails the run on this alone. Only the
 * "installedAt is corrupt" branch returns false, because that indicates
 * the manifest itself is broken.
 */
async function checkReadiness(
  profile: HarnessProfileLike,
  hm: HarnessManifest,
  checks: CheckList,
): Promise<boolean> {
  try {
    const configStat = await stat(hm.mcpConfigPath);
    const installedTime = new Date(hm.installedAt).getTime();
    const configTime = configStat.mtimeMs;

    if (Number.isNaN(installedTime)) {
      checks.push({
        label: `[${profile.displayName}] Readiness`,
        passed: false,
        detail: `Cannot determine readiness — manifest installedAt is invalid (${hm.installedAt})`,
      });
      return false;
    }

    const isReady = configTime > installedTime + 100;
    checks.push({
      label: `[${profile.displayName}] Readiness`,
      passed: true,
      detail: isReady ? "Active (loaded)" : "Waiting for restart",
    });
    return true;
  } catch {
    // Stat failure surfaces in checkMcpConfig as a "cannot read" error;
    // suppress here to avoid double-reporting.
    return true;
  }
}

/** MCP config present and contains UluOps server entries. */
async function checkMcpConfig(
  profile: HarnessProfileLike,
  hm: HarnessManifest,
  checks: CheckList,
): Promise<boolean> {
  try {
    const config = await profile.mcpConfig.read(hm.mcpConfigPath);
    if (profile.mcpConfig.check(config)) {
      checks.push({
        label: `[${profile.displayName}] MCP config present in ${hm.mcpConfigPath} (2 servers)`,
        passed: true,
      });
      return true;
    }
    checks.push({
      label: `[${profile.displayName}] MCP config`,
      passed: false,
      detail: "UluOps servers not found in config",
    });
    return false;
  } catch {
    checks.push({
      label: `[${profile.displayName}] MCP config`,
      passed: false,
      detail: `Cannot read ${hm.mcpConfigPath}`,
    });
    return false;
  }
}

/** Agent files: every file recorded in the manifest exists on disk. */
async function checkAgents(
  profile: HarnessProfileLike,
  hm: HarnessManifest,
  checks: CheckList,
): Promise<boolean> {
  const agentsDir = join(hm.defsPath, "agents");
  try {
    const agentFiles = await readdir(agentsDir);
    const found = hm.agents.filter((a: string) => agentFiles.includes(a)).length;
    const ok = found === hm.agents.length;
    checks.push({
      label: `[${profile.displayName}] ${found}/${hm.agents.length} agents in ${agentsDir}`,
      passed: ok,
      detail: ok ? undefined : `Missing ${hm.agents.length - found} agent(s)`,
    });
    return ok;
  } catch {
    checks.push({
      label: `[${profile.displayName}] Agent files`,
      passed: false,
      detail: `Directory not found: ${agentsDir}`,
    });
    return false;
  }
}

/**
 * Command files: every command recorded in the manifest exists on disk.
 * No-op (returns true) when the manifest records zero commands — keeps the
 * "(0/0 commands)" noise out of the report for harnesses without commands.
 */
async function checkCommands(
  profile: HarnessProfileLike,
  hm: HarnessManifest,
  checks: CheckList,
): Promise<boolean> {
  if (hm.commands.length === 0) return true;
  const commandsDir = join(hm.defsPath, "commands");
  const cmdResults = await Promise.all(
    hm.commands.map(async (cmd) => {
      try {
        await access(join(commandsDir, cmd));
        return true;
      } catch {
        return false;
      }
    }),
  );
  const found = cmdResults.filter(Boolean).length;
  const ok = found === hm.commands.length;
  checks.push({
    label: `[${profile.displayName}] ${found}/${hm.commands.length} commands`,
    passed: ok,
    detail: ok ? undefined : `Missing ${hm.commands.length - found} command(s)`,
  });
  return ok;
}

/**
 * Agent-metrics hook: present in settings + hook.js exists + manifest version
 * matches on-disk version. Each piece is necessary; only all three together
 * means the hook will actually run on the next harness invocation.
 *
 * No-op (returns true) when the manifest says hooks weren't installed or the
 * profile doesn't expose a hook strategy. Version drift returns false even
 * though hooks are technically "present" — drift means setup was upgraded
 * but never re-ran, which silently ships a stale hook against a fresh CLI.
 */
async function checkHooks(
  profile: HarnessProfileLike,
  hm: HarnessManifest,
  checks: CheckList,
): Promise<boolean> {
  if (!hm.hooksInstalled || !profile.hooks || !profile.paths.settingsPath) {
    return true;
  }

  const hookPresent = await profile.hooks.check(profile.paths.settingsPath);
  let hookFilePresent = false;
  if (profile.paths.toolsDir) {
    try {
      await access(join(profile.paths.toolsDir, "dist", "hook.js"));
      hookFilePresent = true;
    } catch {
      /* Missing */
    }
  }

  if (!hookPresent || !hookFilePresent) {
    const missing = [
      ...(!hookPresent ? ["hook not in settings"] : []),
      ...(!hookFilePresent ? ["hook.js not found"] : []),
    ].join(", ");
    checks.push({
      label: `[${profile.displayName}] Agent metrics`,
      passed: false,
      detail: missing,
    });
    return false;
  }

  const installedVersion = profile.paths.toolsDir
    ? await readInstalledMetricsVersion(profile.paths.toolsDir)
    : null;
  const recordedVersion = hm.hooksInstalledVersion ?? null;
  const drift =
    !!recordedVersion &&
    !!installedVersion &&
    recordedVersion !== installedVersion;
  const detail = installedVersion
    ? `v${installedVersion}${drift ? ` (manifest records v${recordedVersion} — out of sync)` : ""}`
    : "version unknown";
  checks.push({
    label: `[${profile.displayName}] Agent metrics hook configured`,
    passed: true,
    detail,
  });
  // Drift is reported as passed=true (verify is read-only) but flips allOk
  // so the user knows a re-run is needed.
  return !drift;
}

/** Verify a single harness entry, appending results to checks. Returns false if any check fails. */
async function verifyHarness(
  harnessName: string,
  hm: HarnessManifest,
  checks: VerifyResult["checks"],
): Promise<boolean> {
  let profile: HarnessProfileLike;
  try {
    profile = getProfile(harnessName);
  } catch {
    checks.push({
      label: `Harness: ${harnessName}`,
      passed: false,
      detail: "Unknown harness in manifest",
    });
    return false;
  }

  // Run sequentially: the checks share a `checks` array and the user-visible
  // report depends on insertion order (readiness → mcp → agents → commands →
  // hooks). Promise.all would scramble that order. AND together at the end so
  // any single failure flips the harness result while every check still gets
  // to push its row.
  const readinessOk = await checkReadiness(profile, hm, checks);
  const mcpOk = await checkMcpConfig(profile, hm, checks);
  const agentsOk = await checkAgents(profile, hm, checks);
  const commandsOk = await checkCommands(profile, hm, checks);
  const hooksOk = await checkHooks(profile, hm, checks);
  return readinessOk && mcpOk && agentsOk && commandsOk && hooksOk;
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
