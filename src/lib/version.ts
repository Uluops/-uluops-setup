import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Read the package version from package.json. */
export async function getVersion(): Promise<string> {
  const pkgPath = join(__dirname, "..", "..", "package.json");
  const pkg = JSON.parse(await readFile(pkgPath, "utf-8")) as {
    version: string;
  };
  return pkg.version;
}
