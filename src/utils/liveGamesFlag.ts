/**
 * Live GitHub game add (dist.zip at runtime).
 *
 * - Off if `VITE_ENABLE_LIVE_GAMES=false`
 * - In production builds: also requires `VITE_GITHUB_PROXY_URL` (Pages has no Vite proxy)
 * - In `import.meta.env.DEV`: on by default (Vite `/api/github-proxy` middleware)
 */
export function isLiveGamesEnabled(): boolean {
  const flag = String(import.meta.env.VITE_ENABLE_LIVE_GAMES ?? "").trim().toLowerCase();
  if (flag === "false" || flag === "0" || flag === "off" || flag === "no") return false;

  const proxy = (import.meta.env.VITE_GITHUB_PROXY_URL as string | undefined)?.trim();
  if (import.meta.env.DEV) return true;
  return Boolean(proxy);
}
