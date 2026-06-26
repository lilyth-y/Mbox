import type { ShowcaseCatalogOptions } from "./showcaseCatalogOptions";
import {
  isBackgroundBlobPath,
  isBackgroundVideoPath,
} from "../../shared/lib/backgroundAssetCatalog";

export const SHOWCASE_CUSTOM_BACKDROP_SESSION_KEY = "mbox-showcase-custom-backdrop";

export function persistShowcaseCustomBackdrop(dataUrl: string): void {
  try {
    sessionStorage.setItem(SHOWCASE_CUSTOM_BACKDROP_SESSION_KEY, dataUrl);
  } catch {
    /* quota exceeded — in-memory only */
  }
}

export function readShowcaseCustomBackdrop(): string | null {
  try {
    return sessionStorage.getItem(SHOWCASE_CUSTOM_BACKDROP_SESSION_KEY);
  } catch {
    return null;
  }
}

export function resolveShowcaseBackgroundMediaPath(
  options: ShowcaseCatalogOptions
): string | null {
  if (options.backgroundMediaPath) {
    return options.backgroundMediaPath;
  }
  if (options.backgroundMediaSource === "custom") {
    return readShowcaseCustomBackdrop();
  }
  return null;
}

export function resolveShowcaseBackgroundMediaIsVideo(
  options: ShowcaseCatalogOptions
): boolean {
  const path = resolveShowcaseBackgroundMediaPath(options);
  if (!path) {
    return false;
  }
  if (isBackgroundBlobPath(path)) {
    return options.backgroundMediaIsVideo;
  }
  return isBackgroundVideoPath(path);
}

export const SHOWCASE_DEFAULT_BACKDROP_PATH = "배경동영상/mf001.mp4";

export const SHOWCASE_FEATURED_BACKDROPS: { path: string; labelKo: string }[] = [
  { path: SHOWCASE_DEFAULT_BACKDROP_PATH, labelKo: "기본 부스 (1080)" },
  { path: "luxury/럭셔리13.mp4", labelKo: "럭셔리 13" },
  { path: "luxury/0_Background_Black_3840x2160 (1).mp4", labelKo: "럭셔리 블랙 4K" },
  { path: "luxury/0_Flutter_Wind_3840x2160.mp4", labelKo: "플러터 윈드 4K" },
  { path: "luxury/0_Animation_White_1080x1920.mp4", labelKo: "화이트 애니메이션" },
  { path: "luxury/0_3d_Model_Abstract_3840x2160 (1).mp4", labelKo: "3D 추상 4K" },
  { path: "luxury/0_Diamond_Gemstone_3840x2160.mp4", labelKo: "다이아몬드 4K" },
  { path: "luxury/0_Gold_Golden_3840x2160.mp4", labelKo: "골드 4K" },
  { path: "luxury/0_Crystals_Geometric_3840x2160.mp4", labelKo: "크리스탈 지오메트릭" },
];
