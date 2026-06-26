/** Virtual MPA routes (rewrite to *.html) — public assets live one level up. */
const VIRTUAL_APP_PREFIXES = ["/showcase", "/premium", "/wedding-simple"] as const;

function pathnameNeedsPublicParent(pathname: string): boolean {
  const path = pathname.split("?")[0] ?? pathname;
  if (path.endsWith(".html")) {
    return false;
  }
  return VIRTUAL_APP_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

/**
 * Resolve a path under `apps/web/public/` (e.g. `havok/HavokPhysics.wasm`).
 * Works from virtual routes like `/showcase/?…` where `./havok/…` would 404.
 */
export function resolvePublicAssetUrl(pathFromPublic: string): string {
  const clean = pathFromPublic.replace(/^\//, "");
  const base = import.meta.env.BASE_URL ?? "/";
  const normalizedBase = base.endsWith("/") ? base : `${base}/`;

  if (typeof window !== "undefined" && pathnameNeedsPublicParent(window.location.pathname)) {
    return new URL(`../${clean}`, window.location.href).href;
  }

  if (typeof window !== "undefined") {
    return new URL(clean, new URL(normalizedBase, window.location.href)).href;
  }

  return normalizedBase === "/" ? `/${clean}` : `${normalizedBase}${clean}`;
}
