/**
 * Optional username step.
 *
 * Setting a username is the one-time prerequisite the registry enforces before
 * a user can create or publish definitions. We offer it during setup so
 * publishers clear the gate up front — but never force it: consumers who only
 * run definitions never need a username, so the step is skippable and is
 * silently skipped in non-interactive runs unless --username is supplied.
 *
 * Uses native fetch against the platform API with the api key the run already
 * resolved — no SDK dependency. Mirrors the PATCH /auth/profile fold-in, where
 * setting a username also confirms it.
 */

const API_BASE = "https://api.uluops.ai/api/v1";

// Canonical username / personal-org slug pattern, shared in spirit with
// ops-api + ops-sdk: 1-40 chars, lowercase alphanumeric with internal hyphens
// or underscores, must start and end alphanumeric (e.g. "ulu-labs").
const USERNAME_REGEX = /^[a-z0-9](?:[a-z0-9_-]{0,38}[a-z0-9])?$/;

/**
 * Pure slug check for the interactive prompt. Returns true when valid, or a
 * message string otherwise (inquirer validate contract). Server validation
 * remains authoritative.
 * @internal Exported for testing only.
 */
export function validateUsername(name: string): string | true {
  if (!name.trim()) return "Username is required";
  if (!USERNAME_REGEX.test(name)) {
    return "1-40 chars, lowercase letters/digits with internal hyphens or underscores (e.g. ulu-labs)";
  }
  return true;
}

interface ProfileResponse {
  data: { user: { username?: string | null } };
  message?: string;
}

/**
 * PATCH /auth/profile with the username. Setting it confirms it (one-time).
 * Returns the confirmed username on success. Throws a friendly Error otherwise.
 * @internal Exported for testing only.
 */
export async function setUsername(apiKey: string, username: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/auth/profile`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ username }),
      signal: AbortSignal.timeout(15000),
    });
  } catch (err) {
    if (err instanceof TypeError) {
      throw new Error("Can't reach api.uluops.ai — check your connection.");
    }
    throw err;
  }

  if (res.ok) {
    const body: unknown = await res.json();
    if (typeof body !== "object" || body === null) {
      throw new Error("Unexpected API response shape");
    }
    const confirmed = (body as ProfileResponse).data?.user?.username;
    return typeof confirmed === "string" ? confirmed : username;
  }

  const errorBody = (await res.json().catch(() => null)) as {
    error?: { message?: string };
    message?: string;
  } | null;
  const message = errorBody?.error?.message ?? errorBody?.message ?? `HTTP ${res.status}`;

  if (res.status === 409) {
    throw new Error(`Username unavailable: ${message}`);
  }
  if (res.status === 400) {
    throw new Error(`Username rejected: ${message}`);
  }
  throw new Error(`Couldn't set username (${res.status}): ${message}`);
}

export interface MaybeSetUsernameOpts {
  /** Resolved api key for the run; without it there is nothing to authenticate with. */
  apiKey: string | null;
  /** Explicit username from --username (non-interactive path). */
  username?: string;
  /** True when prompting is allowed (a TTY run without --yes). */
  interactive: boolean;
  /** Dry run — describe, don't write. */
  dryRun: boolean;
  /** Emit a line of user-facing output. */
  emit: (msg: string) => void;
}

/**
 * Offer to set a username. Resolution order:
 *  - no api key            → skip (nothing to auth with)
 *  - --username supplied   → set it (works non-interactively)
 *  - interactive, no flag  → prompt once; empty input skips
 *  - non-interactive       → skip silently
 *
 * Never throws: a failure to set the username is surfaced as a warning and
 * does not abort setup (it is an optional, publisher-only prerequisite).
 */
export async function maybeSetUsername(opts: MaybeSetUsernameOpts): Promise<void> {
  const { apiKey, interactive, dryRun, emit } = opts;
  if (!apiKey) return;

  let username = opts.username?.trim();

  if (!username) {
    if (!interactive) return; // non-interactive with no flag → skip silently
    const { input } = await import("@inquirer/prompts");
    const answer = await input({
      message: "Registry username (optional — required to publish; press Enter to skip)",
      validate: (v: string) => (v.trim() === "" ? true : validateUsername(v)),
    });
    username = answer.trim();
    if (!username) return; // user skipped
  } else {
    const valid = validateUsername(username);
    if (valid !== true) {
      emit(`  ⚠ Skipping username — ${valid}`);
      return;
    }
  }

  if (dryRun) {
    emit(`  Would set registry username to "${username}".`);
    return;
  }

  try {
    const confirmed = await setUsername(apiKey, username);
    emit(`  Registry username set to "${confirmed}".`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    emit(`  ⚠ ${message} You can set it later with "ulu auth update-profile --username <name>".`);
  }
}
