/** Photo border style on crystal faces (5 presets). */
export type CubeFramePresetId =
  | "rose_gold"
  | "pearl_white"
  | "classic_black"
  | "sage_garden"
  | "royal_navy";

export const CUBE_FRAME_PRESET_IDS = [
  "rose_gold",
  "pearl_white",
  "classic_black",
  "sage_garden",
  "royal_navy",
] as const satisfies readonly CubeFramePresetId[];

/** Built-in BGM catalog paths under `/bgm/` (see apps/web/public/bgm/README.md). */
export type CubeBgmTrackId =
  | "cinematic_romantic"
  | "piano_slideshow"
  | "romantic_wedding"
  | "bridal_chorus"
  | "workspace"
  | "none"
  | "custom";

export type ResolutionEnhanceScale = 1 | 2;

export {
  CUBE_FACE_BG_Z,
  CUBE_FACE_PHOTO_Z,
  CUBE_FACE_UV_INSET,
  CUBE_ORIGINAL_PLATE_BLUR_PX,
  isDistinctVoluMaxBackgroundPlate,
  isTransparentMatteDataUrl,
  isVoluMaxCutoutReady,
  isVoluMaxLayerReady,
  resolveCubeFaceDisplayUrl,
  resolveSubjectForegroundUrl,
  resolveVoluMaxForegroundKind,
  type VoluMaxForegroundKind,
} from "./cubeEffectFramework.js";
