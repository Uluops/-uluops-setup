import type { AuthResult } from "./auth.js";

const API_BASE = "https://api.uluops.ai/api/v1";

/**
 * Pure advisory check: returns the first hint message that applies to the
 * password, or null if none apply. No I/O. Server validation remains the
 * authority — hints exist only to nudge the user toward likely-acceptable
 * inputs before round-tripping to the server.
 * @internal Exported for testing only — not part of the public API.
 */
function getPasswordHint(password: string): string | null {
  if (password.length < 8) return "  ⚠ Hint: server may require at least 8 characters";
  if (password.length > 128) return "  ⚠ Hint: server may reject passwords over 128 characters";
  if (!/[a-z]/.test(password)) return "  ⚠ Hint: server may require a lowercase letter";
  if (!/[A-Z]/.test(password)) return "  ⚠ Hint: server may require an uppercase letter";
  if (!/[0-9]/.test(password)) return "  ⚠ Hint: server may require a number";
  return null;
}

/**
 * Inquirer validate wrapper. Always returns true (hints are non-blocking)
 * and emits the pure-computed hint via console.warn for display.
 * @internal Exported for testing only — not part of the public API.
 */
function hintPassword(password: string): true {
  const hint = getPasswordHint(password);
  if (hint !== null) console.warn(hint);
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
    validate: hintPassword,
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

/**
 * Issue a POST and decode the response into `T` via a caller-supplied
 * structural predicate. `validate` is required, not optional — making it
 * optional in earlier revisions meant a call site could omit it and get
 * back `body as T` with only a "not null, is object" check, which is the
 * pattern type-safety-validator flagged (EPI-OVR/H). Every current call
 * site supplies a real predicate; this signature change locks that in for
 * future call sites.
 */
async function callApi<T extends object>(
  url: string,
  method: string,
  body: Record<string, unknown>,
  bearerToken: string | undefined,
  validate: (res: T) => boolean,
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
    // `body as T` is a type assertion, not a runtime check — the validate
    // predicate is what actually proves the structure. With validate now
    // required, every code path passes through a real shape check before
    // the cast is trusted.
    if (!validate(body as T)) {
      throw new Error("API response failed structural validation");
    }
    return body as T;
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
export { hintPassword, getPasswordHint, validateEmail };
