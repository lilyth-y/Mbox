export type ShowcaseBackdropSample = {
  average: { r: number; g: number; b: number };
  bright: { r: number; g: number; b: number };
  luminance: number;
};

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function sampleShowcaseBackdropColors(
  source: CanvasImageSource,
  width = 48,
  height = 48
): ShowcaseBackdropSample | null {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    return null;
  }

  try {
    if (!drawCanvasImageSourceCover(ctx, source, width, height)) {
      return null;
    }
  } catch {
    return null;
  }

  const { data } = ctx.getImageData(0, 0, width, height);
  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  let brightLum = 0;
  let brightR = 0;
  let brightG = 0;
  let brightB = 0;
  const pixels = width * height;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]! / 255;
    const g = data[i + 1]! / 255;
    const b = data[i + 2]! / 255;
    rSum += r;
    gSum += g;
    bSum += b;
    const lum = r * 0.299 + g * 0.587 + b * 0.114;
    if (lum > brightLum) {
      brightLum = lum;
      brightR = r;
      brightG = g;
      brightB = b;
    }
  }

  return {
    average: {
      r: rSum / pixels,
      g: gSum / pixels,
      b: bSum / pixels,
    },
    bright: { r: brightR, g: brightG, b: brightB },
    luminance: clamp01((rSum + gSum + bSum) / (pixels * 3)),
  };
}

import { computeBackdropCoverTransform, drawCanvasImageSourceCover } from "./showcaseBackdropCover";

function readMediaDimensions(source: CanvasImageSource, fallbackW: number, fallbackH: number) {
  if (source instanceof HTMLVideoElement) {
    return {
      width: source.videoWidth || fallbackW,
      height: source.videoHeight || fallbackH,
    };
  }
  if (source instanceof HTMLImageElement) {
    return {
      width: source.naturalWidth || fallbackW,
      height: source.naturalHeight || fallbackH,
    };
  }
  if (source instanceof HTMLCanvasElement) {
    return { width: source.width, height: source.height };
  }
  return { width: fallbackW, height: fallbackH };
}

/** Draw backdrop media into an equirectangular canvas (temporal blend reduces flicker). */
export function drawMediaEnvPanoramaFrame(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  blendAlpha = 1
): boolean {
  const width = canvas.width;
  const height = canvas.height;
  const { width: mediaWidth, height: mediaHeight } = readMediaDimensions(source, width, height);
  const mediaAspect = mediaWidth / Math.max(mediaHeight, 1);
  const panoAspect = width / Math.max(height, 1);
  const fit = computeBackdropCoverTransform(mediaAspect, panoAspect);

  try {
    const drawWidth = width / Math.max(fit.uScale, 0.001);
    const drawHeight = height / Math.max(fit.vScale, 0.001);
    const sx = -fit.uOffset * drawWidth;
    const sy = -fit.vOffset * drawHeight;

    if (blendAlpha >= 0.999) {
      ctx.clearRect(0, 0, width, height);
      ctx.globalAlpha = 1;
      ctx.drawImage(source, sx, sy, drawWidth, drawHeight);
    } else {
      ctx.globalAlpha = blendAlpha;
      ctx.drawImage(source, sx, sy, drawWidth, drawHeight);
      ctx.globalAlpha = 1;
    }
    return true;
  } catch {
    return false;
  }
}

export function buildShowcaseEnvPanoramaFromMedia(
  source: CanvasImageSource,
  width = 512,
  height = 256
): string {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return "";
  }

  let mediaWidth = width;
  let mediaHeight = height;
  if (source instanceof HTMLVideoElement) {
    mediaWidth = source.videoWidth || width;
    mediaHeight = source.videoHeight || height;
  } else if (source instanceof HTMLImageElement) {
    mediaWidth = source.naturalWidth || width;
    mediaHeight = source.naturalHeight || height;
  } else if (source instanceof HTMLCanvasElement) {
    mediaWidth = source.width;
    mediaHeight = source.height;
  }

  const mediaAspect = mediaWidth / Math.max(mediaHeight, 1);
  const panoAspect = width / Math.max(height, 1);
  const fit = computeBackdropCoverTransform(mediaAspect, panoAspect);

  try {
    const drawWidth = width / Math.max(fit.uScale, 0.001);
    const drawHeight = height / Math.max(fit.vScale, 0.001);
    const sx = -fit.uOffset * drawWidth;
    const sy = -fit.vOffset * drawHeight;
    ctx.drawImage(source, sx, sy, drawWidth, drawHeight);
  } catch {
    return "";
  }

  return canvas.toDataURL("image/jpeg", 0.9);
}

export function buildShowcaseEnvPanoramaDataUrl(
  sample: ShowcaseBackdropSample,
  size = 256
): string {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = Math.max(Math.round(size * 0.5), 64);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return "";
  }

  const { average, bright } = sample;
  const toHex = (r: number, g: number, b: number) =>
    `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;

  const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  grad.addColorStop(0, toHex(bright.r * 0.85 + 0.12, bright.g * 0.85 + 0.14, bright.b * 0.85 + 0.18));
  grad.addColorStop(0.42, toHex(average.r, average.g, average.b));
  grad.addColorStop(1, toHex(average.r * 0.35, average.g * 0.35, average.b * 0.38));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let i = 0; i < 5; i++) {
    const x = (0.18 + i * 0.16) * canvas.width;
    const y = (0.12 + (i % 2) * 0.08) * canvas.height;
    const radius = canvas.width * (0.08 + (i % 3) * 0.02);
    const spot = ctx.createRadialGradient(x, y, 0, x, y, radius);
    spot.addColorStop(0, toHex(bright.r, bright.g, bright.b));
    spot.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = spot;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  return canvas.toDataURL("image/jpeg", 0.88);
}
