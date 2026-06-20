import {
  isTransparentMatteDataUrl,
  isDistinctVoluMaxBackgroundPlate,
  isVoluMaxCutoutReady,
  resolveSubjectForegroundUrl,
} from "@mbox/shared";
import type * as THREE from "three";
import type { ProcessedImage } from "../types";

/** True after AI silhouette matte (dedicated 누끼 or VoluMax AI cutout). */
export function hasSubjectCutout(
  image: Pick<
    ProcessedImage,
    | "preprocessMode"
    | "voluMaxForegroundKind"
    | "backgroundPlateUrl"
    | "subjectForegroundUrl"
    | "url"
  >
): boolean {
  if (image.preprocessMode === "background_removed") {
    return true;
  }
  return isVoluMaxCutoutReady(image);
}

/** True when fg/bg can split for VoluMax parallax — AI silhouette only (not soft matte rectangle). */
export function canUseDualLayerParallax(
  image: Pick<
    ProcessedImage,
    "preprocessMode" | "backgroundPlateUrl" | "voluMaxForegroundKind"
  >
): boolean {
  if (image.preprocessMode === "background_removed") {
    return Boolean(image.backgroundPlateUrl);
  }
  return image.voluMaxForegroundKind === "ai_cutout" && Boolean(image.backgroundPlateUrl);
}

/**
 * VoluMax dual-layer mount: AI person cutout metadata AND a loaded matte texture
 * (never the full JPEG fallback — that causes edge smear in the parallax shader).
 */
/** Plate + transparent fg — requires a real bg-only plate (not composite fallback). */
export function canMountPlateBackedForeground(
  image: Pick<
    ProcessedImage,
    | "backgroundPlateUrl"
    | "subjectForegroundUrl"
    | "url"
    | "preprocessMode"
    | "faceCompositeUrl"
    | "preparedUrl"
    | "originalUrl"
    | "preCropSourceUrl"
  >
): boolean {
  const fgUrl = resolveSubjectForegroundUrl(image);
  if (!fgUrl || !isTransparentMatteDataUrl(fgUrl)) {
    return false;
  }
  return isDistinctVoluMaxBackgroundPlate(image);
}

export function canMountVoluMaxDualLayer(
  image: Pick<
    ProcessedImage,
    | "preprocessMode"
    | "voluMaxForegroundKind"
    | "backgroundPlateUrl"
    | "subjectForegroundUrl"
    | "url"
  >,
  matteTexture: THREE.Texture | null | undefined,
  fullTexture: THREE.Texture | null | undefined,
  plateTexture: THREE.Texture | null | undefined
): boolean {
  if (!isVoluMaxCutoutReady(image)) {
    return false;
  }
  if (!canUseDualLayerParallax(image)) {
    return false;
  }
  if (!plateTexture || !matteTexture || !fullTexture) {
    return false;
  }
  if (matteTexture === fullTexture) {
    return false;
  }
  const fgUrl = resolveSubjectForegroundUrl(image);
  return Boolean(fgUrl && isTransparentMatteDataUrl(fgUrl));
}

export function countSubjectCutouts(images: ProcessedImage[]): number {
  return images.filter((image) => hasSubjectCutout(image)).length;
}
