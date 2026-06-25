/** Fixed 1:1 output for booth / in-store square displays (not short-form). */
export const SHOWCASE_DEVICE_EXPORT_SIZE = 2160;

/** Minimum internal render edge before downscale to device output. */
export const SHOWCASE_EXPORT_MIN_RENDER_SIZE = 2160;

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
  if (typeof window !== "undefined") {
    const w = window as unknown as { __MBOX_EXPORT_SIZE__?: number };
    const fromWindow = w.__MBOX_EXPORT_SIZE__;
    if (typeof fromWindow === "number" && fromWindow >= 720) {
      const size = Math.min(3840, Math.floor(fromWindow));
      return size % 2 === 0 ? size : size + 1;
    }
  }
  const size = override ?? SHOWCASE_DEVICE_EXPORT_SIZE;
  return size % 2 === 0 ? size : size + 1;
}

export function resolveShowcaseRenderSize(
  outputSize: number,
  options?: { cloudFast?: boolean; simplified?: boolean }
): number {
  if (options?.simplified) {
    const capped = Math.min(outputSize, 1024);
    return capped % 2 === 0 ? capped : capped + 1;
  }
  if (options?.cloudFast) {
    return outputSize % 2 === 0 ? outputSize : outputSize + 1;
  }
  // 4K+ output: 1:1 render (4320² supersample is impractical on consumer GPUs).
  const scale =
    outputSize >= 1920 ? 1 : Math.max(1, SHOWCASE_EXPORT_SUPERSAMPLE);
  let render = Math.max(outputSize * scale, SHOWCASE_EXPORT_MIN_RENDER_SIZE);
  return render % 2 === 0 ? render : render + 1;
}

/** H.264 bitrate tuned for fixed-display playback (minimal banding on gradients). */
export function resolveShowcaseEncodeBitrate(outputSize: number): number {
  if (outputSize >= 3840) return 45_000_000;
  if (outputSize >= 2160) return 32_000_000;
  if (outputSize >= 1920) return 24_000_000;
  if (outputSize >= 1080) return 12_000_000;
  if (outputSize >= 1024) return 10_000_000;
  return 6_000_000;
}
