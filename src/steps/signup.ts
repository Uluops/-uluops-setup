import type { AuthResult } from "./auth.js";

const API_BASE = "https://api.uluops.ai/api/v1";

/**
 * Advisory password hints. Returns warning strings for inquirer display,
 * but all are non-blocking — server validation is the authority.
 * @internal Exported for testing only — not part of the public API.
 */
function validatePassword(password: string): true {
  if (password.length < 8) console.warn("  ⚠ Hint: server may require at least 8 characters");
  else if (password.length > 128) console.warn("  ⚠ Hint: server may reject passwords over 128 characters");
  else if (!/[a-z]/.test(password)) console.warn("  ⚠ Hint: server may require a lowercase letter");
  else if (!/[A-Z]/.test(password)) console.warn("  ⚠ Hint: server may require an uppercase letter");
  else if (!/[0-9]/.test(password)) console.warn("  ⚠ Hint: server may require a number");
  return true;
}

/** @internal Exported for testing only — not part of the public API. */
function validateEmail(email: string): string | true {
  if (!email.trim()) return "Email is required";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Invalid email format";
  return true;
}

interface RegisterResponse {
  data: {
    user: { id: string; email: string };
    sessionToken: string;
  };
  message?: string;
}

interface CreateKeyResponse {
  data: {
    key: string;
    apiKey: { id: string; name: string | null };
  };
  message?: string;
}

/**
 * Interactive signup flow: create account + generate API key.
 * Returns the same AuthResult shape as resolveApiKey for seamless integration.
 */
export async function signup(): Promise<AuthResult> {
  const { input, password } = await import("@inquirer/prompts");

  const email = await input({
    message: "Email",
    validate: validateEmail,
  });

  const pwd = await password({
    message: "Password",
    mask: "*",
    validate: validatePassword,
  });

  // Register
  const registerRes = await callApi<RegisterResponse>(
    `${API_BASE}/auth/register`,
    "POST",
    { email, password: pwd },
    undefined,
    (res) => !!res.data?.sessionToken && typeof res.data.user?.email === "string",
  );

  const sessionToken = registerRes.data.sessionToken;

  // Create API key using the session
  const keyRes = await callApi<CreateKeyResponse>(
    `${API_BASE}/auth/keys`,
    "POST",
    { name: "Setup CLI" },
    sessionToken,
    (res) => !!res.data?.key,
  );

  return {
    apiKey: keyRes.data.key,
    email: registerRes.data.user?.email ?? email,
  };
}

async function callApi<T extends object>(
  url: string,
  method: string,
  body: Record<string, unknown>,
  bearerToken?: string,
  validate?: (res: T) => boolean,
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (bearerToken) {
    headers["Authorization"] = `Bearer ${bearerToken}`;
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
  } catch (err) {
    if (err instanceof TypeError) {
      throw new Error(
        "Can't reach api.uluops.ai — check your connection.",
      );
    }
    throw err;
  }

  if (res.ok) {
    const body: unknown = await res.json();
    if (typeof body !== "object" || body === null) {
      throw new Error("Unexpected API response shape");
    }
    const validatedBody = body as T;
    if (validate && !validate(validatedBody)) {
      throw new Error("API response failed structural validation");
    }
    return validatedBody;
  }

  // Handle known error codes
  const errorBody = await res.json().catch(() => null) as {
    error?: { message?: string; code?: string };
    message?: string;
  } | null;
  const message = errorBody?.error?.message ?? errorBody?.message ?? `HTTP ${res.status}`;

  if (res.status === 409) {
    throw new Error(
      `Email already registered. Run without --signup and use your existing API key.`,
    );
  }

  if (res.status === 429) {
    const retryAfter = res.headers.get("Retry-After");
    throw new Error(
      `Rate limited — try again${retryAfter ? ` in ${retryAfter}s` : " shortly"}.`,
    );
  }

  if (res.status === 400) {
    throw new Error(`Registration failed: ${message}`);
  }

  throw new Error(`Signup failed (${res.status}): ${message}`);
}

/** @internal Exported for testing only — not part of the public API. */
export { validatePassword, validateEmail };
