export type BackgroundAssetKind = "image" | "video";

export interface BackgroundAssetCatalogItem {
  file: string;
  /** Omitted = image (legacy catalogs). */
  kind?: BackgroundAssetKind;
  /** Friendly UI label (optional; from catalog builder). */
  label?: string;
}

export interface BackgroundAssetCollection {
  id: string;
  label: string;
  items: BackgroundAssetCatalogItem[];
}

export interface BackgroundAssetCatalog {
  version: number;
  generatedAt?: string;
  collections: BackgroundAssetCollection[];
  skippedCollections?: Array<{ id: string; label: string; fileCount: number; note?: string }>;
}

let catalogCache: BackgroundAssetCatalog | null = null;

/** Public URL for data/background or data/user-assets paths. */
export function resolveBackgroundAssetPublicUrl(relativePath: string): string {
  const base = import.meta.env.BASE_URL ?? "/";
  const normalized = relativePath.replace(/^\/+/, "").replace(/\\/g, "/");
  const segments = normalized.split("/").map((part) => encodeURIComponent(part)).join("/");
  if (normalized.startsWith("user-assets/")) {
    const rest = normalized.slice("user-assets/".length);
    const restSeg = rest.split("/").map((part) => encodeURIComponent(part)).join("/");
    return `${base}user-assets/${restSeg}`;
  }
  return `${base}backgrounds/${segments}`;
}

export function formatBackgroundAssetPath(collectionId: string, file: string): string {
  return `${collectionId}/${file}`;
}

/** Catalog path for picker + scene (handles 사용자_* collections). */
export function resolveBackgroundCatalogAssetPath(collectionId: string, file: string): string {
  if (collectionId.startsWith("사용자_")) {
    return `user-assets/${file}`;
  }
  return formatBackgroundAssetPath(collectionId, file);
}

const VIDEO_EXT = /\.(mp4|webm|mov|m4v)$/i;

export function backgroundAssetKind(item: BackgroundAssetCatalogItem): BackgroundAssetKind {
  if (item.kind === "video" || item.kind === "image") return item.kind;
  return VIDEO_EXT.test(item.file) ? "video" : "image";
}

export function isBackgroundVideoPath(assetPath: string | null | undefined): boolean {
  if (!assetPath) return false;
  return VIDEO_EXT.test(assetPath.trim());
}

export function invalidateBackgroundAssetCatalog(): void {
  catalogCache = null;
}

export async function loadBackgroundAssetCatalog(force = false): Promise<BackgroundAssetCatalog> {
  if (!force && catalogCache) {
    return catalogCache;
  }
  const url = resolveBackgroundAssetPublicUrl("catalog.json");
  const response = await fetch(url, { cache: "no-cache" });
  if (!response.ok) {
    throw new Error(
      `배경 카탈로그를 불러올 수 없습니다 (${response.status}). npm run sync:user-assets (또는 sync:background-catalog) 실행 후 새로고침하세요.`
    );
  }
  catalogCache = (await response.json()) as BackgroundAssetCatalog;
  return catalogCache;
}

export function isUserBackgroundCollection(collectionId: string): boolean {
  return collectionId.startsWith("사용자_");
}

const BACKGROUND_ASSET_DISPLAY_ALIASES: Record<string, string> = {
  "2026_06_10 11_31.mp4": "장미 배경 영상",
  "rose.mp4": "장미 배경 (rose)",
  "0_Background_Black_3840x2160.mp4": "럭셔리 블랙 4K",
  "0_Background_Black_3840x2160 (1).mp4": "럭셔리 블랙 4K",
  "0_Flutter_Wind_3840x2160.mp4": "플러터 윈드 4K",
  "0_Animation_White_1080x1920.mp4": "화이트 애니메이션",
  "0_3d_Model_Abstract_3840x2160 (1).mp4": "3D 추상 4K",
};

export function backgroundAssetDisplayName(assetPath: string | null): string {
  if (!assetPath) return "없음 (검정)";
  const parts = assetPath.replace(/\\/g, "/").split("/");
  const file = parts[parts.length - 1] ?? assetPath;
  return BACKGROUND_ASSET_DISPLAY_ALIASES[file] ?? file;
}
