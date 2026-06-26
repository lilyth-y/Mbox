/**
 * Shared background catalog builder (data/background + data/user-assets).
 */
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { extname, join } from "node:path";

export const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp"]);
export const VIDEO_EXT = new Set([".mp4", ".webm", ".mov", ".m4v"]);

/** Optional friendly labels for catalog filenames (collection-agnostic). */
export const ASSET_DISPLAY_LABELS = {
  "2026_06_10 11_31.mp4": "장미 배경 영상",
  "rose.mp4": "장미 배경 (rose)",
  "mf001.mp4": "배경 동영상 01",
  "mf002.mp4": "배경 동영상 02",
  "mf003.mp4": "배경 동영상 03",
  "0_Background_Black_3840x2160.mp4": "럭셔리 블랙 4K",
  "0_Flutter_Wind_3840x2160.mp4": "플러터 윈드 4K",
  "0_Animation_White_1080x1920.mp4": "화이트 애니메이션",
  "0_3d_Model_Abstract_3840x2160 (1).mp4": "3D 추상 4K",
  "0_Diamond_Gemstone_3840x2160.mp4": "다이아몬드 4K",
  "0_Gold_Golden_3840x2160.mp4": "골드 4K",
  "0_Crystals_Geometric_3840x2160.mp4": "크리스탈 지오메트릭",
  "럭셔리13.mp4": "럭셔리 13",
};

export function resolveAssetDisplayLabel(file) {
  return ASSET_DISPLAY_LABELS[file] ?? file;
}

export function listMediaFiles(dirPath) {
  if (!existsSync(dirPath)) return [];
  return readdirSync(dirPath)
    .filter((name) => {
      const ext = extname(name).toLowerCase();
      return IMAGE_EXT.has(ext) || VIDEO_EXT.has(ext);
    })
    .sort((a, b) => a.localeCompare(b, "ko"))
    .map((file) => ({
      file,
      kind: VIDEO_EXT.has(extname(file).toLowerCase()) ? "video" : "image",
      ...(resolveAssetDisplayLabel(file) !== file ? { label: resolveAssetDisplayLabel(file) } : {}),
    }));
}

export function listUserAssetFiles(dir, allowed) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => allowed.has(extname(name).toLowerCase()))
    .sort((a, b) => a.localeCompare(b, "ko"));
}

/**
 * @param {string} bgRoot data/background
 * @param {string} [userRoot] data/user-assets — when set, merges 사용자_* collections
 */
export function buildBackgroundCatalogCollections(bgRoot, userRoot) {
  const collections = [];

  for (const entry of readdirSync(bgRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
    if (entry.name === "user-assets") continue;
    const dirPath = join(bgRoot, entry.name);
    const items = listMediaFiles(dirPath);
    if (items.length === 0) continue;
    collections.push({
      id: entry.name,
      label: entry.name === "luxury" ? "럭셔리 4K" : entry.name.replace(/_/g, " "),
      items,
    });
  }

  if (!userRoot) return collections;

  const imgDir = join(userRoot, "background", "images");
  const vidDir = join(userRoot, "background", "videos");
  mkdirSync(imgDir, { recursive: true });
  mkdirSync(vidDir, { recursive: true });

  const imageFiles = listUserAssetFiles(imgDir, IMAGE_EXT);
  const videoFiles = listUserAssetFiles(vidDir, VIDEO_EXT);

  if (imageFiles.length > 0) {
    collections.push({
      id: "사용자_이미지",
      label: "사용자 이미지 (드롭)",
      items: imageFiles.map((file) => ({
        file: `background/images/${file}`,
        kind: "image",
      })),
    });
  }

  if (videoFiles.length > 0) {
    collections.push({
      id: "사용자_동영상",
      label: "사용자 동영상 (드롭)",
      items: videoFiles.map((file) => ({
        file: `background/videos/${file}`,
        kind: "video",
      })),
    });
  }

  return collections;
}
