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
