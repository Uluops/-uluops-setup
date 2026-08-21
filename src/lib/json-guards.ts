/**
 * Narrow guards for JSON responses from the UluOps API.
 *
 * Centralised so the same envelope shape (`{ data: { ... } }`) is decoded
 * consistently across call sites (`steps/auth.ts`, `steps/verify.ts`,
 * `steps/signup.ts`). Each guard returns `null` on absent/wrong-typed fields
 * and throws a plain `Error` only when the top-level body shape is so wrong
 * that proceeding would silently coerce garbage into a typed result.
 *
 * Why plain `Error`, not `TypeError`: call sites translate `TypeError` into
 * "Can't reach api.uluops.ai" (fetch's network-failure shape). A `TypeError`
 * here would be misclassified as a network outage.
 */

/**
 * Narrow `{ data: { email: string } }` from an unknown response body.
 * Returns the email string when present and well-typed, null otherwise.
 * Throws when `body` is not an object at all — that indicates the endpoint
 * is no longer the one we expect (HTML error page, redirect to a captive
 * portal, schema breakage) and should surface to the user rather than be
 * papered over as "logged in with no email."
 */
/**
 * Recursively delete `__proto__` / `constructor` / `prototype` OWN keys from
 * parsed-JSON data. Our own merges are spread-based (CreateDataProperty
 * semantics — they cannot be polluted), but a config we read and write BACK
 * would hand a `__proto__` own-key to every other consumer of the file, some
 * of which merge with assign semantics. Strip at the read boundary so the
 * hazard never round-trips. Mutates in place and returns the input.
 */
export function stripDangerousKeys<T>(value: T): T {
  if (typeof value !== "object" || value === null) return value;
  if (Array.isArray(value)) {
    for (const item of value) stripDangerousKeys(item);
    return value;
  }
  const record = value as Record<string, unknown>;
  for (const key of ["__proto__", "constructor", "prototype"]) {
    if (Object.prototype.hasOwnProperty.call(record, key)) {
      delete record[key];
    }
  }
  for (const v of Object.values(record)) stripDangerousKeys(v);
  return value;
}

export function extractEmail(body: unknown): string | null {
  if (typeof body !== "object" || body === null) {
    throw new Error(
      "API returned an unexpected response shape (not an object). The endpoint may have changed — try --skip-validation to continue offline.",
    );
  }
  const data = (body as { data?: unknown }).data;
  if (data === undefined || data === null) return null;
  if (typeof data !== "object") return null;
  const email = (data as { email?: unknown }).email;
  return typeof email === "string" ? email : null;
}
