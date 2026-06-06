import { readFile, access } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

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

    // ops-uluops-api wraps user payloads as { data: { email, ... } }
    const body = (await res.json()) as { data?: { email?: string } };
    return { email: body.data?.email ?? null };
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
