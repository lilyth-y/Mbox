import {
  paintShowcaseExportCompositeFrame,
  type PaintShowcaseExportCompositeOptions,
} from "./showcaseExportCompositeStream";
import {
  SHOWCASE_WYSIWYG_MAX_CENTER_LUMA_DELTA,
  SHOWCASE_WYSIWYG_MAX_CORNER_LUMA_DELTA,
  SHOWCASE_WYSIWYG_MAX_RGB_DELTA,
} from "./showcaseExportSpecs";

export type ShowcaseFrameFingerprint = {
  width: number;
  height: number;
  centerLuma: number;
  cornerLuma: number;
  centerRgb: [number, number, number];
};

export type ShowcaseWysiwygVerificationResult = {
  passed: boolean;
  centerLumaDelta: number;
  cornerLumaDelta: number;
  rgbDelta: number;
  preview: ShowcaseFrameFingerprint;
  exportFrame: ShowcaseFrameFingerprint;
  errors: string[];
};

function meanLumaFromImageData(data: Uint8ClampedArray): number {
  let sum = 0;
  const pixels = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    sum += data[i]! * 0.2126 + data[i + 1]! * 0.7152 + data[i + 2]! * 0.0722;
  }
  return sum / pixels;
}

function meanRgbFromImageData(data: Uint8ClampedArray): [number, number, number] {
  let r = 0;
  let g = 0;
  let b = 0;
  const pixels = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    r += data[i]!;
    g += data[i + 1]!;
    b += data[i + 2]!;
  }
  return [r / pixels, g / pixels, b / pixels];
}

function sampleRegion(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  region: "center" | "corner"
): { luma: number; rgb: [number, number, number] } {
  const sampleW = Math.max(8, Math.floor(width * 0.22));
  const sampleH = Math.max(8, Math.floor(height * 0.22));
  const x =
    region === "center"
      ? Math.floor((width - sampleW) * 0.5)
      : Math.floor(width * 0.04);
  const y =
    region === "center"
      ? Math.floor((height - sampleH) * 0.5)
      : Math.floor(height * 0.04);
  const image = ctx.getImageData(x, y, sampleW, sampleH);
  return {
    luma: meanLumaFromImageData(image.data),
    rgb: meanRgbFromImageData(image.data),
  };
}

export function fingerprintFromCanvas2d(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
): ShowcaseFrameFingerprint {
  const center = sampleRegion(ctx, width, height, "center");
  const corner = sampleRegion(ctx, width, height, "corner");
  return {
    width,
    height,
    centerLuma: center.luma,
    cornerLuma: corner.luma,
    centerRgb: center.rgb,
  };
}

/** Capture pre-record composite frame — same paint path as MP4 export. */
export function captureShowcaseExportPreviewFingerprint(
  options: PaintShowcaseExportCompositeOptions
): ShowcaseFrameFingerprint {
  const canvas = document.createElement("canvas");
  canvas.width = options.size;
  canvas.height = options.size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    throw new Error("[showcase] WYSIWYG preview fingerprint — 2D context unavailable");
  }
  paintShowcaseExportCompositeFrame(ctx, options);
  return fingerprintFromCanvas2d(ctx, options.size, options.size);
}

export function compareShowcaseExportFingerprints(
  preview: ShowcaseFrameFingerprint,
  exported: ShowcaseFrameFingerprint
): ShowcaseWysiwygVerificationResult {
  const errors: string[] = [];
  const centerLumaDelta = Math.abs(preview.centerLuma - exported.centerLuma);
  const cornerLumaDelta = Math.abs(preview.cornerLuma - exported.cornerLuma);
  const rgbDelta = Math.max(
    Math.abs(preview.centerRgb[0] - exported.centerRgb[0]),
    Math.abs(preview.centerRgb[1] - exported.centerRgb[1]),
    Math.abs(preview.centerRgb[2] - exported.centerRgb[2])
  );

  if (centerLumaDelta > SHOWCASE_WYSIWYG_MAX_CENTER_LUMA_DELTA) {
    errors.push(
      `WYSIWYG 중앙 밝기 불일치: Δ${centerLumaDelta.toFixed(1)} (한도 ${SHOWCASE_WYSIWYG_MAX_CENTER_LUMA_DELTA}, preview ${preview.centerLuma.toFixed(1)}, export ${exported.centerLuma.toFixed(1)}).`
    );
  }
  if (cornerLumaDelta > SHOWCASE_WYSIWYG_MAX_CORNER_LUMA_DELTA) {
    errors.push(
      `WYSIWYG 모서리 밝기 불일치: Δ${cornerLumaDelta.toFixed(1)} (한도 ${SHOWCASE_WYSIWYG_MAX_CORNER_LUMA_DELTA}).`
    );
  }
  if (rgbDelta > SHOWCASE_WYSIWYG_MAX_RGB_DELTA) {
    errors.push(
      `WYSIWYG 색상 불일치: ΔRGB ${rgbDelta.toFixed(1)} (한도 ${SHOWCASE_WYSIWYG_MAX_RGB_DELTA}).`
    );
  }

  return {
    passed: errors.length === 0,
    centerLumaDelta,
    cornerLumaDelta,
    rgbDelta,
    preview,
    exportFrame: exported,
    errors,
  };
}

export function fingerprintFromVideoFrame(
  video: HTMLVideoElement,
  width: number,
  height: number
): ShowcaseFrameFingerprint {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    throw new Error("[showcase] WYSIWYG export fingerprint — 2D context unavailable");
  }
  ctx.drawImage(video, 0, 0, width, height);
  return fingerprintFromCanvas2d(ctx, width, height);
}
