import { readFile, access, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { extractEmail } from "../lib/json-guards.js";
import { atomicWrite } from "../lib/atomic-write.js";

export interface AuthResult {
  apiKey: string;
  email: string | null;
}

function getKeyPrefix(): string {
  return process.env["ULUOPS_KEY_PREFIX"] ?? "ulr_";
}

function credentialsPath(): string {
  return join(homedir(), ".uluops", "credentials.json");
}

/**
 * Returns true if a credentials file exists at the default path.
 * Used by the setup flow to skip the "new account?" prompt for returning users.
 * Existence-only — does not validate the file's shape or contents.
 */
export async function hasCredentialsFile(): Promise<boolean> {
  try {
    await access(credentialsPath());
    return true;
  } catch {
    return false;
  }
}

/**
 * Persist an API key to ~/.uluops/credentials.json so @uluops/cli and the SDK
 * can resolve it from disk without ULUOPS_API_KEY in the shell environment.
 *
 * Merges into the existing file when present: only the `default` profile is
 * replaced; any other named profiles are preserved. Creates ~/.uluops/ with
 * mode 0o700 if missing. Writes the file at 0o600 via atomicWrite.
 */
export async function writeCredentialsFile(
  apiKey: string,
  opts?: { email?: string | null; source?: "signup" | "flag" | "prompt"; dryRun?: boolean },
): Promise<void> {
  if (opts?.dryRun) return;

  const credsPath = credentialsPath();
  await mkdir(dirname(credsPath), { recursive: true, mode: 0o700 });

  // Merge: preserve any non-default profiles already on disk.
  let existing: Record<string, unknown> = {};
  try {
    const raw = await readFile(credsPath, "utf-8");
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      existing = parsed as Record<string, unknown>;
    }
  } catch {
    // No existing file, or unparseable — start fresh.
  }

  const merged = {
    ...existing,
    default: {
      // type discriminant must match the shape @uluops/cli writes via
      // saveCredentials and the shape @uluops/sdk-core's StoredProfile expects.
      // Without it, `ulu auth logout` reads creds.type !== 'api_key' and
      // dispatches the revocation call with no bearer header — the server-side
      // key survives a "successful" logout.
      type: "api_key" as const,
      apiKey,
      email: opts?.email ?? null,
      createdAt: new Date().toISOString(),
      source: opts?.source ?? "flag",
    },
  };

  await atomicWrite(credsPath, JSON.stringify(merged, null, 2) + "\n", {
    mode: 0o600,
  });
}

/**
 * Resolve API key from flags, env, credentials file, or interactive prompt.
 */
export async function resolveApiKey(options: {
  apiKeyFlag?: string;
  skipValidation?: boolean;
  interactive?: boolean;
}): Promise<AuthResult> {
  let apiKey = options.apiKeyFlag;

  // 1. Flag
  if (!apiKey) {
    // 2. Env var
    apiKey = process.env["ULUOPS_API_KEY"];
  }

  if (!apiKey) {
    // 3. Credentials file
    apiKey = await readCredentialsFile();
  }

  if (!apiKey) {
    // 4. Interactive prompt
    if (!options.interactive) {
      throw new Error(
        "No API key found. Pass --api-key or set ULUOPS_API_KEY. Get one at app.uluops.ai/settings/api-keys",
      );
    }

    const prefix = getKeyPrefix();
    const { input } = await import("@inquirer/prompts");
    apiKey = await input({
      message: "Enter your UluOps API key",
      validate: (val) => {
        if (!val.trim()) return "Get a key at app.uluops.ai/settings/api-keys";
        if (!val.startsWith(prefix))
          return `API keys typically start with ${prefix} — if your key has a different format, just paste it and server validation will check it`;
        return true;
      },
    });
  }

  const prefix = getKeyPrefix();
  if (!apiKey.startsWith(prefix) && !options.skipValidation) {
    process.stderr.write(`  ⚠ Key does not start with expected prefix "${prefix}" — proceeding with server validation\n`);
  }

  // Validate against server
  if (!options.skipValidation) {
    const result = await validateKey(apiKey);
    return { apiKey, email: result.email };
  }

  return { apiKey, email: null };
}

async function readCredentialsFile(): Promise<string | undefined> {
  const credsPath = credentialsPath();
  let raw: string;
  try {
    raw = await readFile(credsPath, "utf-8");
  } catch {
    return undefined; // File doesn't exist
  }

  let creds: unknown;
  try {
    creds = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `Malformed credentials file at ${credsPath}: ${err instanceof Error ? err.message : "invalid JSON"}`,
    );
  }

  if (typeof creds !== "object" || creds === null) return undefined;
  const profiles = creds as Record<string, { apiKey?: string; api_key?: string }>;
  const defaultProfile = profiles["default"];
  return defaultProfile?.apiKey ?? defaultProfile?.api_key;
}

async function validateKey(
  apiKey: string,
): Promise<{ email: string | null }> {
  // Self-identity lives in ops-uluops-api (`/api/v1/auth/me`), not the
  // registry-api users namespace. Registry-api `/users/:id` Zod-validates the
  // id as UUID, so /users/me returns 400 with `id: ["Invalid uuid"]`.
  const url = "https://api.uluops.ai/api/v1/auth/me";
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(15000),
    });

    if (res.status === 401) {
      throw new Error(
        "Invalid API key — generate a new one at app.uluops.ai/settings/api-keys",
      );
    }

    if (!res.ok) {
      throw new Error(`API returned ${res.status}. Try --skip-validation to continue offline.`);
    }

    // ops-uluops-api wraps user payloads as { data: { email, ... } }.
    // Guard against malformed responses (HTML error pages, proxy interception,
    // schema drift) — bare `as` would let `data` be a string, number, or null
    // and produce a silent `email: null` result that looks like a normal
    // logged-in user with no email on record.
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      throw new Error(
        "API returned a non-JSON response. The endpoint may be down or behind a captive portal — try --skip-validation to continue offline.",
      );
    }
    return { email: extractEmail(body) };
  } catch (err) {
    // fetch() throws TypeError for network failures (ENOTFOUND, ECONNREFUSED).
    // Re-thrown errors from the res.status checks above are plain Error instances.
    if (err instanceof TypeError) {
      throw new Error(
        "Can't reach api.uluops.ai — check your connection. Use --skip-validation to continue offline.",
      );
    }
    throw err;
  }
}
