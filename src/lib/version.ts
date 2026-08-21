import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Read the package version from package.json. */
export async function getVersion(): Promise<string> {
  const pkgPath = join(__dirname, "..", "..", "package.json");
  let pkg: unknown;
  try {
    pkg = JSON.parse(await readFile(pkgPath, "utf-8"));
  } catch (err) {
    // A truncated package.json (interrupted npx cache write) should surface
    // as the same deliberate broken-publish error as a missing version.
    throw new Error(
      `Malformed package.json at ${pkgPath}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  const version =
    typeof pkg === "object" && pkg !== null
      ? (pkg as { version?: unknown }).version
      : undefined;
  if (typeof version !== "string" || !version) {
    // Our own package.json — this firing means a broken publish, not user
    // error. Fail loudly rather than stamping "undefined" into banners and
    // the manifest's setupVersion.
    throw new Error(`Malformed package.json at ${pkgPath}: missing version`);
  }
  return version;
}
