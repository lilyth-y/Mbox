/** Fixed 1:1 output for booth / in-store square displays (not short-form). */
export const SHOWCASE_DEVICE_EXPORT_SIZE = 1080;

/** Minimum internal render edge (2K+) before downscale to device output. */
export const SHOWCASE_EXPORT_MIN_RENDER_SIZE = 2048;

/** Supersample factor; combined with min render clamp (1080×2 → 2160). */
export const SHOWCASE_EXPORT_SUPERSAMPLE = 2;

export const SHOWCASE_EXPORT_FPS = 60;

/** Max |Δluma| between preview composite and export first frame (H.264 tolerance). */
export const SHOWCASE_WYSIWYG_MAX_CENTER_LUMA_DELTA = 35;

/** Corner/background region — slightly looser (gradient + encode). */
export const SHOWCASE_WYSIWYG_MAX_CORNER_LUMA_DELTA = 48;

/** Max per-channel RGB delta on center patch. */
export const SHOWCASE_WYSIWYG_MAX_RGB_DELTA = 42;

export function resolveShowcaseExportOutputSize(
  override?: number
): number {
  const size = override ?? SHOWCASE_DEVICE_EXPORT_SIZE;
  return size % 2 === 0 ? size : size + 1;
}

export function resolveShowcaseRenderSize(outputSize: number): number {
  const scale = Math.max(1, SHOWCASE_EXPORT_SUPERSAMPLE);
  let render = Math.max(outputSize * scale, SHOWCASE_EXPORT_MIN_RENDER_SIZE);
  return render % 2 === 0 ? render : render + 1;
}

/** H.264 bitrate tuned for fixed-display playback (minimal banding on gradients). */
export function resolveShowcaseEncodeBitrate(outputSize: number): number {
  if (outputSize >= 1920) return 24_000_000;
  if (outputSize >= 1080) return 12_000_000;
  if (outputSize >= 1024) return 10_000_000;
  return 6_000_000;
}
