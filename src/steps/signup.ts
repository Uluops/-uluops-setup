import type { AuthResult } from "./auth.js";

const API_BASE = "https://api.uluops.ai/api/v1";

/**
 * Password complexity rules (matches ops-uluops-api validation).
 * Validated client-side for instant feedback before network round-trip.
 */
function validatePassword(password: string): string | true {
  if (password.length < 8) return "Password must be at least 8 characters";
  if (password.length > 128) return "Password must be at most 128 characters";
  if (!/[a-z]/.test(password)) return "Password must include a lowercase letter";
  if (!/[A-Z]/.test(password)) return "Password must include an uppercase letter";
  if (!/[0-9]/.test(password)) return "Password must include a number";
  return true;
}

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
  );

  const sessionToken = registerRes.data.sessionToken;

  // Create API key using the session
  const keyRes = await callApi<CreateKeyResponse>(
    `${API_BASE}/auth/keys`,
    "POST",
    { name: "Setup CLI" },
    sessionToken,
  );

  return {
    apiKey: keyRes.data.key,
    email: registerRes.data.user.email,
  };
}

async function callApi<T>(
  url: string,
  method: string,
  body: Record<string, unknown>,
  bearerToken?: string,
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
    return (await res.json()) as T;
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

// Exported for testing
export { validatePassword, validateEmail };
