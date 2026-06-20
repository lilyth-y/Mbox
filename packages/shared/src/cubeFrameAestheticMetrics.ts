import {
  CUBE_FRAME_PRESET_IDS,
  type CubeFramePresetId,
} from "./cube-export.js";

/** UV insets for hologram fan mode — keep in sync with photoFrameGlsl.ts */
export const HOLOGRAM_FRAME_UV = {
  frameScale: 1.05,
  photoInset: 0.052 * 1.05,
  matInset: 0.028 * 1.05,
  frameWidth: 0.058 * 1.05,
} as const;

export interface FramePixelBuffer {
  width: number;
  height: number;
  /** RGBA row-major */
  data: Uint8ClampedArray;
  /** Optional face bbox in pixel coords (defaults to full image) */
  faceRect?: { x: number; y: number; size: number };
}

export interface FrameAestheticSample {
  presetId: CubeFramePresetId;
  /** Frame band luminance texture energy (0–1) */
  frameBandTexture: number;
  /** Mat vs frame separation score (0–1) */
  matFrameSeparation: number;
  /** Accent inset ring strength (0–1) */
  accentLineStrength: number;
  /** Left/right balance in frame band (0–1) */
  lateralSymmetry: number;
  /** Photo core detail preserved (0–1) */
  subjectPreservation: number;
  /** Measured accent vs design palette (0–1) */
  paletteFidelity: number;
  /** Weighted composite Frame Quality Index (0–1) */
  fqi: number;
  /** Raw diagnostics for reports */
  raw: {
    frameBandLumaStd: number;
    /** Outer decorative frame vs photo core ΔE (hologram-safe contrast proxy) */
    matFrameDeltaE: number;
    accentGradient: number;
    coreLumaStd: number;
    frameMeanRgb: [number, number, number];
    matMeanRgb: [number, number, number];
    outerFrameMeanRgb: [number, number, number];
    coreMeanRgb: [number, number, number];
  };
}

export interface FrameAestheticThresholds {
  fqiMin: number;
  componentMin: number;
  matFrameDeltaEMin: number;
  matFrameDeltaEMax: number;
  frameBandLumaStdMin: number;
  coreLumaStdMin: number;
}

export const DEFAULT_FRAME_AESTHETIC_THRESHOLDS: FrameAestheticThresholds = {
  fqiMin: 0.72,
  componentMin: 0.55,
  matFrameDeltaEMin: 6,
  matFrameDeltaEMax: 70,
  frameBandLumaStdMin: 8,
  coreLumaStdMin: 12,
};

/** Representative accent RGB (0–255) per preset — mid-tone from frameAccentColor GLSL */
export const FRAME_PRESET_ACCENT_RGB: Record<
  CubeFramePresetId,
  { accent: [number, number, number]; mat: [number, number, number] }
> = {
  rose_gold: { accent: [220, 178, 158], mat: [255, 246, 239] },
  pearl_white: { accent: [210, 208, 218], mat: [250, 250, 252] },
  classic_black: { accent: [105, 88, 55], mat: [56, 54, 51] },
  sage_garden: { accent: [168, 198, 155], mat: [245, 250, 239] },
  royal_navy: { accent: [131, 112, 94], mat: [239, 242, 250] },
};

const FQI_WEIGHTS = {
  frameBandTexture: 0.18,
  matFrameSeparation: 0.2,
  accentLineStrength: 0.16,
  lateralSymmetry: 0.14,
  subjectPreservation: 0.16,
  paletteFidelity: 0.16,
} as const;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function edgeDist(u: number, v: number): number {
  return Math.min(Math.min(u, 1 - u), Math.min(v, 1 - v));
}

function rgbToLab(r: number, g: number, b: number): [number, number, number] {
  let rr = r / 255;
  let gg = g / 255;
  let bb = b / 255;
  rr = rr > 0.04045 ? ((rr + 0.055) / 1.055) ** 2.4 : rr / 12.92;
  gg = gg > 0.04045 ? ((gg + 0.055) / 1.055) ** 2.4 : gg / 12.92;
  bb = bb > 0.04045 ? ((bb + 0.055) / 1.055) ** 2.4 : bb / 12.92;
  const x = (rr * 0.4124 + gg * 0.3576 + bb * 0.1805) / 0.95047;
  const y = (rr * 0.2126 + gg * 0.7152 + bb * 0.0722) / 1.0;
  const z = (rr * 0.0193 + gg * 0.1192 + bb * 0.9505) / 1.08883;
  const fx = x > 0.008856 ? x ** (1 / 3) : 7.787 * x + 16 / 116;
  const fy = y > 0.008856 ? y ** (1 / 3) : 7.787 * y + 16 / 116;
  const fz = z > 0.008856 ? z ** (1 / 3) : 7.787 * z + 16 / 116;
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

function deltaE(
  a: [number, number, number],
  b: [number, number, number]
): number {
  const la = rgbToLab(a[0], a[1], a[2]);
  const lb = rgbToLab(b[0], b[1], b[2]);
  return Math.hypot(la[0] - lb[0], la[1] - lb[1], la[2] - lb[2]);
}

function luma(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function meanRgb(samples: [number, number, number][]): [number, number, number] {
  if (samples.length === 0) {
    return [0, 0, 0];
  }
  let r = 0;
  let g = 0;
  let b = 0;
  for (const [sr, sg, sb] of samples) {
    r += sr;
    g += sg;
    b += sb;
  }
  const n = samples.length;
  return [r / n, g / n, b / n];
}

function std(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const variance =
    values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function resolveFaceRect(buffer: FramePixelBuffer): {
  x: number;
  y: number;
  size: number;
} {
  if (buffer.faceRect) {
    return buffer.faceRect;
  }
  const size = Math.min(buffer.width, buffer.height);
  return {
    x: Math.floor((buffer.width - size) / 2),
    y: Math.floor((buffer.height - size) / 2),
    size,
  };
}

function samplePixel(
  buffer: FramePixelBuffer,
  px: number,
  py: number
): [number, number, number] {
  const idx = (py * buffer.width + px) * 4;
  return [
    buffer.data[idx] ?? 0,
    buffer.data[idx + 1] ?? 0,
    buffer.data[idx + 2] ?? 0,
  ];
}

export function measureFrameAesthetic(
  buffer: FramePixelBuffer,
  presetId: CubeFramePresetId
): FrameAestheticSample {
  const { photoInset, matInset } = HOLOGRAM_FRAME_UV;
  const face = resolveFaceRect(buffer);
  const step = Math.max(1, Math.floor(face.size / 128));

  const frameBandLumas: number[] = [];
  const frameBandRgbs: [number, number, number][] = [];
  const outerFrameRgbs: [number, number, number][] = [];
  const matBandRgbs: [number, number, number][] = [];
  const coreRgbs: [number, number, number][] = [];
  const coreLumas: number[] = [];
  const leftFrameLumas: number[] = [];
  const rightFrameLumas: number[] = [];
  let accentGradientMax = 0;

  for (let py = face.y; py < face.y + face.size; py += step) {
    for (let px = face.x; px < face.x + face.size; px += step) {
      const u = (px - face.x + 0.5) / face.size;
      const v = (py - face.y + 0.5) / face.size;
      const dist = edgeDist(u, v);
      const rgb = samplePixel(buffer, px, py);
      const y = luma(rgb[0], rgb[1], rgb[2]);

      if (dist >= photoInset + 0.01) {
        coreLumas.push(y);
        coreRgbs.push(rgb);
      }

      const inMat =
        dist >= matInset + 0.003 &&
        dist < photoInset - 0.004;
      if (inMat) {
        matBandRgbs.push(rgb);
      }

      const inOuterFrame = dist < matInset + 0.002;
      const inBorderRing = dist < photoInset - 0.004;
      if (inOuterFrame) {
        outerFrameRgbs.push(rgb);
      }
      if (inBorderRing) {
        frameBandLumas.push(y);
        frameBandRgbs.push(rgb);
        if (u < 0.5) {
          leftFrameLumas.push(y);
        } else {
          rightFrameLumas.push(y);
        }
      }

      if (Math.abs(dist - photoInset) < 0.007) {
        const neighbors = [
          samplePixel(buffer, Math.min(px + step, face.x + face.size - 1), py),
          samplePixel(buffer, Math.max(px - step, face.x), py),
          samplePixel(buffer, px, Math.min(py + step, face.y + face.size - 1)),
          samplePixel(buffer, px, Math.max(py - step, face.y)),
        ];
        const centerY = y;
        for (const n of neighbors) {
          accentGradientMax = Math.max(
            accentGradientMax,
            Math.abs(centerY - luma(n[0], n[1], n[2]))
          );
        }
      }
    }
  }

  const frameBandLumaStd = std(frameBandLumas);
  const coreLumaStd = std(coreLumas);
  const frameMeanRgb =
    frameBandRgbs.length > 0 ? meanRgb(frameBandRgbs) : ([0, 0, 0] as [number, number, number]);
  const outerFrameMeanRgb =
    outerFrameRgbs.length > 0
      ? meanRgb(outerFrameRgbs)
      : frameMeanRgb;
  const coreMeanRgb =
    coreRgbs.length > 0 ? meanRgb(coreRgbs) : ([0, 0, 0] as [number, number, number]);
  const matMeanRgb =
    matBandRgbs.length > 0 ? meanRgb(matBandRgbs) : frameMeanRgb;
  const matFrameDeltaE =
    outerFrameRgbs.length > 0 && coreRgbs.length > 0
      ? deltaE(outerFrameMeanRgb, coreMeanRgb)
      : 0;

  const leftMean =
    leftFrameLumas.length > 0
      ? leftFrameLumas.reduce((a, b) => a + b, 0) / leftFrameLumas.length
      : 0;
  const rightMean =
    rightFrameLumas.length > 0
      ? rightFrameLumas.reduce((a, b) => a + b, 0) / rightFrameLumas.length
      : 0;

  const expected = FRAME_PRESET_ACCENT_RGB[presetId];
  const paletteDelta = deltaE(outerFrameMeanRgb, expected.accent);

  const frameBandTexture =
    frameBandLumas.length < 12 ? 0 : clamp01(frameBandLumaStd / 28);
  const matFrameSeparation =
    outerFrameRgbs.length < 8 || matBandRgbs.length < 12
      ? 0
      : clamp01((matFrameDeltaE - 2) / 20);
  const accentLineStrength = clamp01(accentGradientMax / 24);
  const lateralSymmetry = clamp01(
    1 - Math.abs(leftMean - rightMean) / 40
  );
  const subjectPreservation = clamp01(coreLumaStd / 36);
  const paletteFidelity =
    outerFrameRgbs.length < 8 ? 0 : clamp01(1 - paletteDelta / 55);

  const components = {
    frameBandTexture,
    matFrameSeparation,
    accentLineStrength,
    lateralSymmetry,
    subjectPreservation,
    paletteFidelity,
  };

  let logWeighted = 0;
  let weightSum = 0;
  for (const key of Object.keys(FQI_WEIGHTS) as (keyof typeof FQI_WEIGHTS)[]) {
    const w = FQI_WEIGHTS[key];
    logWeighted += w * Math.log(Math.max(components[key], 1e-6));
    weightSum += w;
  }
  const fqi = clamp01(Math.exp(logWeighted / weightSum));

  return {
    presetId,
    ...components,
    fqi,
    raw: {
      frameBandLumaStd,
      matFrameDeltaE,
      accentGradient: accentGradientMax,
      coreLumaStd,
      frameMeanRgb,
      matMeanRgb,
      outerFrameMeanRgb,
      coreMeanRgb,
    },
  };
}

export function passesFrameAestheticGate(
  sample: FrameAestheticSample,
  thresholds: FrameAestheticThresholds = DEFAULT_FRAME_AESTHETIC_THRESHOLDS
): { pass: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (sample.fqi < thresholds.fqiMin) {
    reasons.push(`FQI ${sample.fqi.toFixed(3)} < ${thresholds.fqiMin}`);
  }
  const components: (keyof typeof FQI_WEIGHTS)[] = [
    "frameBandTexture",
    "matFrameSeparation",
    "accentLineStrength",
    "lateralSymmetry",
    "subjectPreservation",
    "paletteFidelity",
  ];
  for (const key of components) {
    if (sample[key] < thresholds.componentMin) {
      reasons.push(`${key} ${sample[key].toFixed(3)} < ${thresholds.componentMin}`);
    }
  }
  if (sample.raw.frameBandLumaStd < thresholds.frameBandLumaStdMin) {
    reasons.push(
      `frameBandLumaStd ${sample.raw.frameBandLumaStd.toFixed(2)} < ${thresholds.frameBandLumaStdMin}`
    );
  }
  if (sample.raw.coreLumaStd < thresholds.coreLumaStdMin) {
    reasons.push(
      `coreLumaStd ${sample.raw.coreLumaStd.toFixed(2)} < ${thresholds.coreLumaStdMin}`
    );
  }
  if (
    sample.raw.matFrameDeltaE < thresholds.matFrameDeltaEMin ||
    sample.raw.matFrameDeltaE > thresholds.matFrameDeltaEMax
  ) {
    reasons.push(
      `matFrameDeltaE ${sample.raw.matFrameDeltaE.toFixed(2)} outside [${thresholds.matFrameDeltaEMin}, ${thresholds.matFrameDeltaEMax}]`
    );
  }
  return { pass: reasons.length === 0, reasons };
}

/** Tier-1 synthetic face buffer with realistic band structure for metric calibration */
export function synthesizeReferenceFrameBuffer(
  presetId: CubeFramePresetId,
  size = 512
): FramePixelBuffer {
  const data = new Uint8ClampedArray(size * size * 4);
  const palette = FRAME_PRESET_ACCENT_RGB[presetId];
  const { photoInset, matInset } = HOLOGRAM_FRAME_UV;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = (x + 0.5) / size;
      const v = (y + 0.5) / size;
      const dist = edgeDist(u, v);
      const idx = (y * size + x) * 4;

      let r = 0;
      let g = 0;
      let b = 0;

      if (dist >= photoInset + 0.01) {
        r = 80 + u * 140 + v * 40;
        g = 60 + v * 120;
        b = 90 + (1 - u) * 100;
      } else if (dist >= matInset + 0.003 && dist < photoInset - 0.004) {
        [r, g, b] = palette.mat;
      } else if (dist < matInset + 0.002) {
        const grain =
          0.5 +
          0.5 *
            Math.sin(u * 18 + v * 14) *
            Math.cos(v * 22 - u * 11);
        if (presetId === "royal_navy") {
          const band = 0.5 + 0.5 * Math.sin(u * 12 + v * 9);
          r = 100 + band * 38 + grain * 10;
          g = 82 + band * 34 + grain * 8;
          b = 62 + band * 38 + grain * 6;
        } else if (presetId === "sage_garden") {
          r = palette.accent[0] * (0.78 + grain * 0.22);
          g = palette.accent[1] * (0.78 + grain * 0.22);
          b = palette.accent[2] * (0.78 + grain * 0.22);
        } else {
          const accentScale = presetId === "pearl_white" ? 0.72 : 0.82;
          r = palette.accent[0] * (accentScale + grain * (1 - accentScale + 0.12));
          g = palette.accent[1] * (accentScale + grain * (1 - accentScale + 0.12));
          b = palette.accent[2] * (accentScale + grain * (1 - accentScale + 0.12));
        }
      }

      if (Math.abs(dist - photoInset) < 0.004) {
        r = Math.min(255, r + 36);
        g = Math.min(255, g + 28);
        b = Math.min(255, b + 18);
      }

      data[idx] = Math.round(r);
      data[idx + 1] = Math.round(g);
      data[idx + 2] = Math.round(b);
      data[idx + 3] = 255;
    }
  }

  return { width: size, height: size, data };
}

/** Flat matte-only buffer — should fail FQI gates (counterexample) */
export function synthesizeBrokenFrameBuffer(size = 512): FramePixelBuffer {
  const data = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 240;
    data[i + 1] = 240;
    data[i + 2] = 238;
    data[i + 3] = 255;
  }
  return { width: size, height: size, data };
}

export function listFramePresetIds(): CubeFramePresetId[] {
  return [...CUBE_FRAME_PRESET_IDS];
}
