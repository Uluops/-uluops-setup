/**
 * The setup command that repairs or updates an install without moving it.
 *
 * Install location is chosen by flags (`--scope`, `--local-defs`) but recorded
 * per harness in the manifest (`mcpScope`, `defsScope`). A hint that says only
 * `npx @uluops/setup --harness X` re-runs with the flag defaults, so following
 * it on a local install writes a global one and leaves the local tree
 * untracked. Until 0.19.0 every re-run hint did exactly that. Every hint now
 * goes through here and carries the recorded scope.
 */
export interface RerunScope {
  mcpScope: "global" | "local";
  defsScope: "global" | "local";
}

/** `npx @uluops/setup --harness <names>` plus the scope flags that reproduce `scope`. */
export function rerunCommand(harnesses: readonly string[], scope: RerunScope): string {
  const parts = ["npx @uluops/setup"];
  if (harnesses.length > 0) parts.push(`--harness ${harnesses.join(",")}`);
  if (scope.mcpScope === "local") parts.push("--scope local");
  if (scope.defsScope === "local") parts.push("--local-defs");
  return parts.join(" ");
}

/**
 * One command per group of harnesses that share a scope, in first-seen order —
 * harnesses installed with different flags cannot be repaired by one command.
 */
export function rerunCommandsFor(
  entries: readonly (readonly [string, RerunScope])[],
): string[] {
  const groups = new Map<string, { names: string[]; scope: RerunScope }>();
  for (const [name, scope] of entries) {
    const key = `${scope.mcpScope}/${scope.defsScope}`;
    const group = groups.get(key) ?? { names: [], scope };
    group.names.push(name);
    groups.set(key, group);
  }
  return [...groups.values()].map((g) => rerunCommand(g.names, g.scope));
}
