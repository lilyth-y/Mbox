export interface UserBgmCatalogItem {
  file: string;
  label: string;
  /** Relative to /user-assets/ e.g. bgm/song.mp3 */
  publicPath: string;
}

export interface UserBgmCatalog {
  version: number;
  generatedAt?: string;
  root: string;
  items: UserBgmCatalogItem[];
}

let cache: UserBgmCatalog | null = null;

export function resolveUserAssetPublicUrl(relativePath: string): string {
  const base = import.meta.env.BASE_URL ?? "/";
  const normalized = relativePath.replace(/^\/+/, "").replace(/\\/g, "/");
  const segments = normalized.split("/").map((part) => encodeURIComponent(part)).join("/");
  return `${base}user-assets/${segments}`;
}

export function invalidateUserBgmCatalog(): void {
  cache = null;
}

export async function loadUserBgmCatalog(force = false): Promise<UserBgmCatalog> {
  if (!force && cache) return cache;
  const url = resolveUserAssetPublicUrl("bgm/catalog.json");
  const response = await fetch(url, { cache: "no-cache" });
  if (!response.ok) {
    return { version: 1, root: "data/user-assets/bgm", items: [] };
  }
  cache = (await response.json()) as UserBgmCatalog;
  return cache;
}

export function userBgmDisplayName(
  trackId: string,
  workspacePath: string | null,
  customLabel?: string | null
): string {
  if (trackId === "none") return "없음";
  if (trackId === "custom") return customLabel ?? "직접 업로드";
  if (trackId === "workspace" && workspacePath) {
    const parts = workspacePath.split("/");
    return parts[parts.length - 1] ?? workspacePath;
  }
  return trackId;
}
