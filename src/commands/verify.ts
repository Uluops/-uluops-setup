import chalk from "chalk";
import { verify } from "../steps/verify.js";
import { ok, warn, fail, info } from "../lib/display.js";
import { getVersion } from "../lib/version.js";

/**
 * The `--verify` flow: prints one check line per verify-step result
 * (manifest, per-harness readiness/MCP/files/hook, API key) and exits 1
 * when any check failed. A skipped check prints with a warning glyph and
 * does not fail the run. Read-only — makes no changes.
 */
export async function runVerify(): Promise<void> {
  const version = await getVersion();
  console.log();
  console.log(
    `  ${chalk.dim("⟨u⟩")} ${chalk.cyan.bold("ulu")}${chalk.bold("·ops")} Installation Check v${version}`,
  );
  console.log();

  const result = await verify();

  // Details print on every row, passed ones included. Until 0.19.0 a passed
  // row printed its label only, which hid hook drift (then a passed row that
  // failed the run: all ticks followed by "Some checks failed") and still
  // hides nothing now that rows carry versions and "update available" notes.
  for (const check of result.checks) {
    if (check.skipped) {
      warn(`${check.label}${check.detail ? ` — ${check.detail}` : ""}`);
    } else if (check.passed) {
      ok(`${check.label}${check.detail ? chalk.dim(` — ${check.detail}`) : ""}`);
    } else {
      fail(`${check.label}${check.detail ? ` — ${check.detail}` : ""}`);
    }
  }

  console.log();
  if (result.ok) {
    info(chalk.green("All checks passed."));
  } else {
    info(chalk.red("Some checks failed."));
    // The fix keeps each harness where it is installed: a bare
    // `npx @uluops/setup` would re-run with the default (global) scope.
    if (result.fixCommands.length > 0) {
      info(
        result.fixCommands.length === 1
          ? "To fix, re-run:"
          : "To fix, re-run (harnesses installed with different flags):",
      );
      for (const cmd of result.fixCommands) info(`  ${chalk.cyan(cmd)}`);
    }
  }
  console.log();

  process.exit(result.ok ? 0 : 1);
}
