/**
 * Presentation effect safety framework (안전성 7 : 퀄리티 3).
 *
 * - Safety (7): defaults OFF, flat mount when depth OFF, timeline-gated parallax,
 *   face-local XY only (no Z gap / no rotation-coupled layer drift), capped intensities,
 *   UV inset clip on VoluMax layers (no bleed past cube face).
 * - Quality (3): polish only inside allowed phases and below caps — never bypass gates.
 *
 * New effects must extend this file first, then wire UI opt-in + scene gates.
 */

export const CUBE_EFFECT_SAFETY_WEIGHT = 7;
export const CUBE_EFFECT_QUALITY_WEIGHT = 3;

/** Fan timeline phases where optional VoluMax depth parallax may run. */
export const PARALLAX_ALLOWED_FAN_PHASES = ["showcase_hold"] as const;
export type ParallaxAllowedFanPhase = (typeof PARALLAX_ALLOWED_FAN_PHASES)[number];

/** Hard caps for quality knobs (cannot exceed without changing this framework). */
export const CUBE_PARALLAX_PEAK_MAX = 0.34;
export const CUBE_PARALLAX_FG_MUL_MAX = 0.48;
export const CUBE_PARALLAX_BG_MUL_MAX = 0.36;
/** VoluMax mesh XY drive (world-unit offset at norm=1; keep <= face UV inset margin). */
/** Near UV-inset cap so mesh XY parallax reads on a 2.55 face plane. */
export const CUBE_PARALLAX_FG_MUL_VOLUMAX = 0.095;
export const CUBE_PARALLAX_BG_MUL_VOLUMAX = 0.082;
/** Local +Z offset for photo planes — flush on shell face. */
export const CUBE_FACE_PHOTO_Z = 0.018;
/** Local Z for VoluMax plate (non-cutout parallax only). */
export const CUBE_FACE_BG_Z = -0.022;
export const CUBE_FOCUS_PULSE_Z_MAX = 0.048;
export const CUBE_DEPTH_BLUR_PX_MAX = 28;
/** Blur strength when background plate theme is explicit `original_blurred`. */
export const CUBE_ORIGINAL_PLATE_BLUR_PX = 22;
/** Matches photoFrameGlsl photoInset (~0.036 * 1.05). Discards pixels outside face window. */
export const CUBE_FACE_UV_INSET = 0.038;
/** User mesh scale (3D preview) — independent of fan timeline `presentationScale`. */
export const CUBE_SIZE_SCALE_MIN = 0.55;
export const CUBE_SIZE_SCALE_MAX = 1.85;
export const DEFAULT_CUBE_SIZE_SCALE = 1;

export function clampCubeSizeScale(scale: number): number {
  return Math.min(CUBE_SIZE_SCALE_MAX, Math.max(CUBE_SIZE_SCALE_MIN, scale));
}
/** Max UV warp delta for VoluMax disp shader (stay inside ~0.038 face inset). */
export const CUBE_PARALLAX_UV_WARP_MAX = 0.035;
export type CubeVoluMaxMountMode = "disp" | "mesh";

/** Peak angular speed for cube inertia integrator (matches fan EHI ~120°/s cap). */
export const CUBE_ANGULAR_SPEED_MAX_RAD = (120 * Math.PI) / 180;
/** Rotation spring stiffness / damping (rad/s² per rad error, per rad/s). */
export const CUBE_INERTIA_ROTATION_STIFFNESS = 18;
export const CUBE_INERTIA_ROTATION_DAMPING = 7.5;
export const CUBE_INERTIA_HOLD_STIFFNESS = 26;
export const CUBE_INERTIA_HOLD_DAMPING = 11;
export const CUBE_INERTIA_SCALE_STIFFNESS = 14;
export const CUBE_INERTIA_SCALE_DAMPING = 8;
/** Primary cube-face VoluMax mount: UV warp shader. Set to "mesh" only for legacy Z-split fallback. */
export const CUBE_VOLUMAX_MOUNT_MODE: CubeVoluMaxMountMode = "disp";
/** Slightly smaller plane scale when VoluMax layers move (safety margin inside ring). */
export const CUBE_FACE_CONTENT_SCALE = 0.94;
export const CUBE_VOLUMAX_ALPHA_TEST = 0.08;
/** Reference cube face plane size (main presentationScene). */
/** Framed shell face: CUBE_EDGE_LENGTH (2.5) × frame mesh scale (1.04). */
export const CUBE_FACE_PLANE_SIZE_REF = 2.6;
/** Default cube_focus timeline speed (1 = legacy; lower = slower beats). */
export const DEFAULT_FAN_SPEED = 0.82;

export function isParallaxAllowedForFanPhase(phase: string): phase is ParallaxAllowedFanPhase {
  return (PARALLAX_ALLOWED_FAN_PHASES as readonly string[]).includes(phase);
}

export function clampParallaxAmount(
  amount: number,
  peakMax: number = CUBE_PARALLAX_PEAK_MAX
): number {
  return Math.min(peakMax, Math.max(0, amount));
}

/** 0 at hold start/end, 1 at hold center — keeps parallax aligned with face-forward beat. */
export function showcaseHoldParallaxEnvelope(phaseU: number): number {
  const u = Math.min(1, Math.max(0, phaseU));
  return Math.sin(u * Math.PI);
}

export function clampParallaxMul(mul: number, max: number): number {
  return Math.min(max, Math.max(0, mul));
}

/** Peak |XY| position offset in syncCubeFaceMotion (world units). */
export function maxVoluMaxParallaxOffsetWorld(): number {
  return CUBE_PARALLAX_FG_MUL_VOLUMAX;
}

/** Peak UV warp for VoluMax disp mount (shader path). */
export function maxVoluMaxUvWarpDelta(): number {
  return CUBE_PARALLAX_UV_WARP_MAX;
}

/** Foreground layer URL — explicit matte, or cutout/volumax face `url` when unset. */
export function resolveSubjectForegroundUrl(image: {
  preprocessMode?: string;
  subjectForegroundUrl?: string | null;
  url?: string;
}): string | null {
  if (image.subjectForegroundUrl) {
    return image.subjectForegroundUrl;
  }
  if (image.preprocessMode === "background_removed" || image.preprocessMode === "volumax") {
    return image.url ?? null;
  }
  return null;
}

/**
 * Full cube-face photo (background intact) — never the transparent matte alone.
 * VoluMax parallax uses subjectForegroundUrl for the silhouette layer; this URL is the visible base.
 */
export function resolveCubeFaceDisplayUrl(image: {
  url?: string;
  preparedUrl?: string;
  faceCompositeUrl?: string;
  backgroundPlateUrl?: string | null;
  subjectForegroundUrl?: string | null;
  originalUrl?: string;
  preCropSourceUrl?: string;
}): string {
  const url = image.url ?? "";
  const fg = image.subjectForegroundUrl ?? null;
  const urlIsMatte = isTransparentMatteDataUrl(url);
  const urlIsFgMatte = Boolean(fg && url === fg);

  if (!urlIsMatte && !urlIsFgMatte) {
    return url;
  }

  const prepared = image.preparedUrl ?? "";
  if (prepared && !isTransparentMatteDataUrl(prepared)) {
    return prepared;
  }

  const composite = image.faceCompositeUrl ?? "";
  if (composite && composite !== fg) {
    return composite;
  }

  if (image.backgroundPlateUrl) {
    return image.backgroundPlateUrl;
  }

  const original = image.preCropSourceUrl ?? image.originalUrl ?? "";
  if (original && !isTransparentMatteDataUrl(original)) {
    return original;
  }

  return url;
}

/**
 * Every cube face must have a background plate URL — baked theme plate or full-photo fallback.
 */
export function resolvePresentationBackgroundPlateUrl(image: {
  url?: string;
  preparedUrl?: string;
  faceCompositeUrl?: string;
  backgroundPlateUrl?: string | null;
  subjectForegroundUrl?: string | null;
  originalUrl?: string;
  preCropSourceUrl?: string;
}): string {
  if (image.backgroundPlateUrl) {
    return image.backgroundPlateUrl;
  }
  const display = resolveCubeFaceDisplayUrl(image);
  if (display && !isTransparentMatteDataUrl(display)) {
    return display;
  }
  const original = image.preCropSourceUrl ?? image.originalUrl ?? image.preparedUrl ?? "";
  if (original && !isTransparentMatteDataUrl(original)) {
    return original;
  }
  return display || image.url || "";
}

/**
 * VoluMax bg plate must be background-only — not the full composite / fg matte / display URL
 * (using those as plate stacks cutout on top of the same subjects → ghost doubles).
 */
export function isDistinctVoluMaxBackgroundPlate(image: {
  url?: string;
  preparedUrl?: string;
  faceCompositeUrl?: string;
  backgroundPlateUrl?: string | null;
  subjectForegroundUrl?: string | null;
  originalUrl?: string;
  preCropSourceUrl?: string;
}): boolean {
  const plate = image.backgroundPlateUrl;
  if (!plate) {
    return false;
  }
  const fg = image.subjectForegroundUrl ?? null;
  if (fg && plate === fg) {
    return false;
  }
  const display = resolveCubeFaceDisplayUrl(image);
  if (plate === display) {
    return false;
  }
  const url = image.url ?? "";
  if (url && plate === url) {
    return false;
  }
  const composite = image.faceCompositeUrl ?? "";
  if (composite && plate === composite) {
    return false;
  }
  return true;
}

/** PNG/WebP data URLs (or .png paths) carry alpha for VoluMax foreground mattes. */
export function isTransparentMatteDataUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  if (url.startsWith("data:image/png") || url.startsWith("data:image/webp")) {
    return true;
  }
  return /\.png(\?|#|$)/i.test(url);
}

/** How the VoluMax foreground matte was produced. */
export type VoluMaxForegroundKind = "ai_cutout" | "soft_matte" | "none";

export function resolveVoluMaxForegroundKind(image: {
  preprocessMode?: string;
  voluMaxForegroundKind?: VoluMaxForegroundKind;
}): VoluMaxForegroundKind {
  if (image.voluMaxForegroundKind) {
    return image.voluMaxForegroundKind;
  }
  if (image.preprocessMode === "background_removed") {
    return "ai_cutout";
  }
  return "none";
}

/** True when AI (or dedicated 누끼) produced a silhouette matte — required for VoluMax edge parallax. */
export function isVoluMaxCutoutReady(image: {
  preprocessMode?: string;
  voluMaxForegroundKind?: VoluMaxForegroundKind;
  backgroundPlateUrl?: string | null;
  subjectForegroundUrl?: string | null;
  url?: string;
}): boolean {
  if (!image.backgroundPlateUrl) {
    return false;
  }
  const kind = resolveVoluMaxForegroundKind(image);
  if (kind !== "ai_cutout") {
    return false;
  }
  const fg = resolveSubjectForegroundUrl(image);
  return Boolean(fg && isTransparentMatteDataUrl(fg));
}

/** True when blurred plate + transparent foreground matte exist (dual-layer depth). */
export function isVoluMaxLayerReady(image: {
  preprocessMode?: string;
  voluMaxPrepared?: boolean;
  voluMaxForegroundKind?: VoluMaxForegroundKind;
  backgroundPlateUrl?: string | null;
  subjectForegroundUrl?: string | null;
  url?: string;
}): boolean {
  if (!image.backgroundPlateUrl) {
    return false;
  }
  const fg = resolveSubjectForegroundUrl(image);
  return Boolean(fg && isTransparentMatteDataUrl(fg));
}

export function maxAllowedParallaxOffsetWorld(
  planeSize: number = CUBE_FACE_PLANE_SIZE_REF
): number {
  return CUBE_FACE_UV_INSET * planeSize;
}
