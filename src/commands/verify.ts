import chalk from "chalk";
import { verify } from "../steps/verify.js";
import { ok, fail, info } from "../lib/display.js";
import { getVersion } from "../lib/version.js";

export async function runVerify(): Promise<void> {
  const version = await getVersion();
  console.log();
  console.log(
    `  ${chalk.dim("⟨u⟩")} ${chalk.cyan.bold("ulu")}${chalk.bold("·ops")} Installation Check v${version}`,
  );
  console.log();

  const result = await verify();

  for (const check of result.checks) {
    if (check.passed) {
      ok(check.label);
    } else {
      fail(`${check.label}${check.detail ? ` — ${check.detail}` : ""}`);
    }
  }

  console.log();
  if (result.ok) {
    info(chalk.green("All checks passed."));
  } else {
    info(chalk.red("Some checks failed. Run npx @uluops/setup to fix."));
  }
  console.log();

  process.exit(result.ok ? 0 : 1);
}
