/**
 * VoluMax 2.5D animation model (After Effects VoluMax 6/7 + Cream Motion tutorials).
 *
 * Pipeline:
 * 1. Subject cutout (transparent PNG) — foreground layer
 * 2. Original background plate — separate bg layer with adjustable "background distance"
 * 3. Grayscale depth map (white=near, black=far) — displaces UVs on camera move
 * 4. Parallax FX boost at showcase hold — subject warps forward, background recesses
 *
 * Web implementation: `createDualLayerParallaxMaterial` (UV warp) on cube faces;
 * mesh Z-offset fallback kept for non-shader paths.
 */

import {
  isTransparentMatteDataUrl,
  resolveSubjectForegroundUrl,
  resolveVoluMaxForegroundKind,
  type CubeFramePresetId,
} from "@mbox/shared";
import type { ImageCenter } from "../../shared/types";
import type { ProcessedImage } from "../../shared/types";
import type { DualLayerParallaxOptions } from "./cubeDualLayerParallaxMaterial";
import { hasDepthSeparationBoost } from "../../shared/lib/subjectPortrait";

const DEFAULT_FOCUS: ImageCenter = { x: 50, y: 50 };

export function presentationFocusForImage(
  image: ProcessedImage,
  hologramMode: boolean
): ImageCenter {
  if (hologramMode) {
    return DEFAULT_FOCUS;
  }
  return image.center ?? DEFAULT_FOCUS;
}

/** VoluMax "background distance" — higher pushes plate farther on parallax. */
export const VOLUMAX_BG_PARALLAX_MUL_HOLOGRAM = 1.14;
export const VOLUMAX_BG_PARALLAX_MUL_DEFAULT = 0.92;

export function volumaxDualLayerOptions(
  image: ProcessedImage,
  framePresetId: CubeFramePresetId,
  hologramMode: boolean
): DualLayerParallaxOptions {
  const fgUrl = resolveSubjectForegroundUrl(image);
  const fgKind = resolveVoluMaxForegroundKind(image);
  const trustFgAlpha = Boolean(
    fgUrl &&
      isTransparentMatteDataUrl(fgUrl) &&
      (fgKind === "ai_cutout" || image.preprocessMode === "background_removed")
  );
  return {
    portraitBoost: !trustFgAlpha && hasDepthSeparationBoost(image),
    subjectBounds: image.subject.bounds,
    bgParallaxMul: hologramMode ? VOLUMAX_BG_PARALLAX_MUL_HOLOGRAM : VOLUMAX_BG_PARALLAX_MUL_DEFAULT,
    framePresetId,
    hologramMode,
    trustFgAlpha,
  };
}
