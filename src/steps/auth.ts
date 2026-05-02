import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

export interface AuthResult {
  apiKey: string;
  email: string | null;
}

function getKeyPrefix(): string {
  return process.env["ULUOPS_KEY_PREFIX"] ?? "ulr_";
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
    console.warn(`  ⚠ Key does not start with expected prefix "${prefix}" — proceeding with server validation`);
  }

  // Validate against server
  if (!options.skipValidation) {
    const result = await validateKey(apiKey);
    return { apiKey, email: result.email };
  }

  return { apiKey, email: null };
}

async function readCredentialsFile(): Promise<string | undefined> {
  try {
    const credsPath = join(homedir(), ".uluops", "credentials.json");
    const raw = await readFile(credsPath, "utf-8");
    const creds = JSON.parse(raw) as Record<
      string,
      { apiKey?: string; api_key?: string }
    >;
    const defaultProfile = creds["default"];
    return defaultProfile?.apiKey ?? defaultProfile?.api_key;
  } catch {
    return undefined;
  }
}

async function validateKey(
  apiKey: string,
): Promise<{ email: string | null }> {
  const url = "https://api.uluops.ai/api/v1/registry/users/me";
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

    const data = (await res.json()) as { email?: string };
    return { email: data.email ?? null };
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
