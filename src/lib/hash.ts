import { createHash } from "node:crypto";

/** Return the full SHA-256 hash (64 hex chars) of the given string content. */
export function fileHash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}
