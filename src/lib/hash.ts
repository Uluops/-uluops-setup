import { createHash } from "node:crypto";

/** Return a truncated SHA-256 hash (12 hex chars) of the given string content. */
export function fileHash(content: string): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 12);
}
