/** Shared health check timeout, configurable via ULUOPS_HEALTH_TIMEOUT env var. */
export function getHealthTimeout(): number {
  const env = process.env["ULUOPS_HEALTH_TIMEOUT"];
  if (env) {
    const ms = Number(env);
    if (Number.isFinite(ms) && ms > 0) return ms;
  }
  return 10_000;
}
