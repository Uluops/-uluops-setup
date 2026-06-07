/**
 * Filter parser for `runUninstall`. Mirrors the install-side selection
 * syntax (`--harness all`, comma-split, `--all-detected` synonym, conflict
 * detection) but resolves against the manifest's recorded harnesses
 * rather than detection — uninstall only acts on what's actually
 * installed.
 *
 * Returns the resolved subset of harness names to uninstall, or `null`
 * meaning "every harness in the manifest" (the no-filter default —
 * today's behavior preserved).
 *
 * Throws on:
 *   - flag conflict: --harness <name> + --all-detected
 *   - unknown harness in filter: every named harness must exist in the
 *     manifest, otherwise the user typed something that won't do what
 *     they expect (fail fast, don't pretend to uninstall a no-op)
 */

export class UninstallFilterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UninstallFilterError";
  }
}

export interface UninstallFilterInput {
  /** Value of --harness (may be undefined when not passed). */
  harnessArg?: string;
  /** Whether --harness was actually passed on the CLI (not just defaulted). */
  harnessFromCli: boolean;
  /** Whether --all-detected was passed. */
  allDetected: boolean;
  /** Names of harnesses actually present in the on-disk manifest. */
  manifestHarnesses: string[];
}

/**
 * @returns string[] — subset of manifestHarnesses to uninstall
 * @returns null — uninstall every harness in the manifest (today's
 *                 default behavior; preserved for back-compat)
 */
export function resolveUninstallFilter(
  input: UninstallFilterInput,
): string[] | null {
  // Conflict: --all-detected with --harness <specific-name> is ambiguous.
  // The 'all' literal is exempt because both flags mean the same thing
  // there (uninstall everything).
  if (
    input.allDetected &&
    input.harnessFromCli &&
    input.harnessArg &&
    input.harnessArg.trim() !== "all"
  ) {
    throw new UninstallFilterError(
      `--harness ${input.harnessArg} conflicts with --all-detected; pick one`,
    );
  }

  // --all-detected (with or without --harness all) → no filter, uninstall all.
  if (input.allDetected) return null;

  // No --harness passed → no filter, uninstall all (today's behavior).
  if (!input.harnessFromCli || !input.harnessArg) return null;

  // --harness all → no filter, uninstall all.
  const trimmed = input.harnessArg.trim();
  if (trimmed === "all") return null;

  // Otherwise parse comma-split subset.
  const requested = trimmed
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (requested.length === 0) return null; // pathological — treat as no filter

  // Validate every requested name exists in the manifest. A typo or a
  // harness the user never installed should fail fast — silently
  // skipping would let `--uninstall --harness claude-coed` succeed with
  // zero work and the user thinking they uninstalled something.
  const unknown = requested.filter(
    (n) => !input.manifestHarnesses.includes(n),
  );
  if (unknown.length > 0) {
    const listed = input.manifestHarnesses.length > 0
      ? input.manifestHarnesses.join(", ")
      : "(none)";
    throw new UninstallFilterError(
      `Unknown harness in --harness filter: ${unknown.join(", ")}. ` +
        `Manifest contains: ${listed}`,
    );
  }

  return requested;
}
