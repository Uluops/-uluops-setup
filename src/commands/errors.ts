/**
 * Typed setup errors. Each class corresponds to a distinct failure category
 * the per-harness orchestrator (or the top-level CLI handler) needs to
 * discriminate to choose the right exit code, message, and continue/abort
 * decision.
 *
 * Discrimination at the type level — not on error.message — because messages
 * are user-facing and will drift; constructors are stable.
 */

/**
 * Raised when the user declines a "Continue?" conflict prompt during a
 * first-install for a harness. The single-harness path catches this in
 * the CLI top-level handler and exits 0 cleanly (today's UX). The
 * multi-harness path catches it in the per-harness loop, marks that
 * harness as `declined`, and continues with siblings.
 *
 * NOT an operational failure — this is a deliberate user choice. The
 * exit-code classifier (spec §7.5) treats `declined` as exit 0 unless
 * combined with an actual `failed` harness in the same run.
 */
export class ConflictRejectedError extends Error {
  constructor(public readonly harnessName: string) {
    super(`User declined conflict prompt for ${harnessName}`);
    this.name = "ConflictRejectedError";
  }
}
