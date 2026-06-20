import { resolveJewelPhotoRasterCacheKey } from "./jewelPhotoRasterSpec";import type { JewelPhotoTextureOptions } from "./jewelPhotoTextureTypes";

const MAX_CACHED_BITMAPS = 36;

type BitmapCacheEntry = {
  bitmap: ImageBitmap;
  width: number;
  height: number;
  lastUsed: number;
};

const bitmapCache = new Map<string, BitmapCacheEntry>();

function cropCacheSuffix(crop?: JewelPhotoTextureOptions["crop"]): string {
  if (!crop?.center || typeof crop.center.x !== "number") {
    return "";
  }
  const focus = crop.focus?.centering ?? "centered";
  const bounds = crop.subjectBounds;
  const boundsKey = bounds
    ? `@b${bounds.x0},${bounds.y0},${bounds.x1},${bounds.y1}`
    : "";
  return `@c${crop.center.x},${crop.center.y}@${focus}${boundsKey}`;
}

/** Stable key for raster output (shape crop + silhouette clip). */
export function resolveJewelPhotoBitmapCacheKey(
  imageUrl: string,
  options: JewelPhotoTextureOptions,
  outWidth: number,
  outHeight: number
): string {
  const shapeId = options.shapeId ?? "cube";
  const layout = options.photoLayout ?? "auto";
  const base = resolveJewelPhotoRasterCacheKey(imageUrl, shapeId, layout);
  const matte = options.preserveAlphaSource ? "@matte" : "";
  const crop = cropCacheSuffix(options.crop);
  return `${base}${matte}${crop}@${outWidth}x${outHeight}@clip2`;
}

export function peekJewelPhotoBitmap(key: string): ImageBitmap | undefined {
  const entry = bitmapCache.get(key);
  if (!entry) {
    return undefined;
  }
  entry.lastUsed = performance.now();
  return entry.bitmap;
}

export function storeJewelPhotoBitmap(
  key: string,
  bitmap: ImageBitmap,
  width: number,
  height: number
): void {
  const existing = bitmapCache.get(key);
  if (existing && existing.bitmap !== bitmap) {
    existing.bitmap.close();
  }
  bitmapCache.set(key, { bitmap, width, height, lastUsed: performance.now() });
  evictJewelPhotoBitmaps();
}

function evictJewelPhotoBitmaps(): void {
  while (bitmapCache.size > MAX_CACHED_BITMAPS) {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    for (const [key, entry] of bitmapCache) {
      if (entry.lastUsed < oldestTime) {
        oldestTime = entry.lastUsed;
        oldestKey = key;
      }
    }
    if (!oldestKey) {
      break;
    }
    const removed = bitmapCache.get(oldestKey);
    removed?.bitmap.close();
    bitmapCache.delete(oldestKey);
  }
}

export function clearJewelPhotoBitmapCache(): void {
  for (const entry of bitmapCache.values()) {
    entry.bitmap.close();
  }
  bitmapCache.clear();
}

export function jewelPhotoBitmapCacheSize(): number {
  return bitmapCache.size;
}
