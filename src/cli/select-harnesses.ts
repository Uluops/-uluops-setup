/**
 * Multi-target harness selection (spec §5 behavior matrix).
 *
 * Pure-ish: every external dependency (prompt, info-emitter) is injected
 * so this module is testable without spawning the CLI or mocking inquirer.
 * The cli.ts entry point wires it to real @inquirer/prompts + chalk-styled
 * info() calls; tests pass plain callbacks and assert on the returned
 * harnessNames + the prompt-input received by the callback.
 *
 * Flag conflict detection happens here, not in cli.ts, so the error
 * messaging is uniform and a single test surface covers every CLI
 * combinatoric.
 */

import type { HarnessProfile } from "../harnesses/index.js";

export interface HarnessSelectionInput {
  /**
   * Value of the --harness flag as received from commander. May be a single
   * canonical name ('claude-code'), an alias ('claude'), a comma-separated
   * list ('claude-code,codex'), the 'all' sentinel, or the default
   * (e.g. 'claude-code' when no --harness was passed).
   */
  harnessArg: string;
  /**
   * True when commander.getOptionValueSource('harness') === 'cli', i.e.
   * the user actually passed --harness. False when only the default fired.
   */
  harnessFromCli: boolean;
  /** Whether --all-detected was passed. */
  allDetected: boolean;
  /** Result of detectHarnesses() — stable profiles whose home dirs exist. */
  detected: HarnessProfile[];
  /**
   * Fallback harness when zero are detected and the user did not pass an
   * explicit single name. Today: 'claude-code' (the landing-page promise).
   */
  defaultHarness: string;
  /**
   * Whether the run is interactive (TTY + no --yes / --api-key /
   * ULUOPS_API_KEY). The selection branch only prompts when this is true
   * AND multiple harnesses are detected.
   */
  isInteractive: boolean;
  /**
   * Async callback that presents the multi-select checkbox to the user.
   * Receives the detected profiles; returns the chosen subset of harness
   * names. Only called when isInteractive && detected.length > 1 && no
   * explicit --harness / --all-detected was provided. May return an empty
   * array (user unchecked everything) — runSetup handles that case.
   */
  promptCheckbox: (profiles: HarnessProfile[]) => Promise<string[]>;
  /**
   * Optional info-line emitter for the "dimmed notice" branches. No-op when
   * undefined (tests can pass a recorder; cli.ts passes the styled info()).
   */
  emitInfo?: (msg: string) => void;
}

export class HarnessSelectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HarnessSelectionError";
  }
}

/**
 * Parse a --harness value into a list of names (or the 'all' sentinel).
 * Comma-separated parsing splits on `,` and trims whitespace; empty
 * tokens are dropped. 'all' is reserved — a literal harness named 'all'
 * would conflict (no such harness exists today).
 */
export function parseHarnessArg(arg: string): string[] | "all" {
  const trimmed = arg.trim();
  if (trimmed === "all") return "all";
  return trimmed
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Resolve the set of harness names to install into.
 *
 * Behavior matrix mirrors spec §5:
 *
 *   | --harness     | --all-detected | TTY | detected | result                          |
 *   |---------------|----------------|-----|----------|---------------------------------|
 *   | omitted       | no             |  *  |    0     | [defaultHarness]                |
 *   | omitted       | no             |  *  |    1     | [detected[0]]                   |
 *   | omitted       | no             | yes |   >1     | promptCheckbox(detected)        |
 *   | omitted       | no             | no  |   >1     | [detected[0]] + dimmed notice   |
 *   | <name>        | no             |  *  |    *     | [<name>]                        |
 *   | <a>,<b>       | no             |  *  |    *     | [<a>, <b>]                      |
 *   | all           | no             |  *  |   >0     | detected.map(p => p.name)       |
 *   | all           | no             |  *  |    0     | [defaultHarness]                |
 *   | omitted       | yes            |  *  |   >0     | detected.map(p => p.name)       |
 *   | omitted       | yes            |  *  |    0     | [defaultHarness]                |
 *   | all           | yes            |  *  |    *     | (same as either alone)          |
 *   | <name>        | yes            |  *  |    *     | ERROR: conflicting flags        |
 *
 * Caller is responsible for validating each returned name via getProfile()
 * (typo detection) and for handling the empty-array case (user unchecked
 * everything — runSetup exits cleanly).
 */
export async function selectHarnesses(
  input: HarnessSelectionInput,
): Promise<string[]> {
  // Flag conflict — explicit --harness <name> + --all-detected is
  // ambiguous and should fail fast before any state is touched. The 'all'
  // sentinel is the one case where the two flags ARE compatible (they mean
  // the same thing) so we accept that combination silently.
  if (
    input.allDetected &&
    input.harnessFromCli &&
    input.harnessArg.trim() !== "all"
  ) {
    throw new HarnessSelectionError(
      `--harness ${input.harnessArg} conflicts with --all-detected; pick one`,
    );
  }

  // Explicit --harness wins over --all-detected, with one harmonization:
  // --harness all behaves identically to --all-detected.
  if (input.harnessFromCli) {
    const parsed = parseHarnessArg(input.harnessArg);
    if (parsed === "all") {
      return input.detected.length > 0
        ? input.detected.map((p) => p.name)
        : [input.defaultHarness];
    }
    return parsed;
  }

  // --all-detected without --harness
  if (input.allDetected) {
    return input.detected.length > 0
      ? input.detected.map((p) => p.name)
      : [input.defaultHarness];
  }

  // Auto-detection (no explicit flags)
  if (input.detected.length === 0) {
    return [input.defaultHarness];
  }
  if (input.detected.length === 1) {
    const only = input.detected[0]!;
    if (only.name !== input.defaultHarness && input.emitInfo) {
      input.emitInfo(
        `Detected ${only.displayName} — using as target (pass --harness to override)`,
      );
    }
    return [only.name];
  }

  // detected.length > 1
  if (input.isInteractive) {
    return await input.promptCheckbox(input.detected);
  }

  // Non-interactive with multiple detected: today's behavior preserved
  // (first detected + dimmed notice). Multi-harness CI users opt in with
  // --all-detected. Spec §10.1.
  if (input.emitInfo) {
    input.emitInfo(
      `Multiple harnesses detected (${input.detected.map((p) => p.displayName).join(", ")}); defaulting to ${input.detected[0]!.displayName} — pass --all-detected to install into all`,
    );
  }
  return [input.detected[0]!.name];
}
