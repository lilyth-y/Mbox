import type { FanBladeFrameId } from "./fanBladeFrame.js";
import { fanBladeOrnamentAssetUrl, type FanBladeOrnamentKind } from "./fanBladeOrnamentAssets.js";

export type { FanBladeOrnamentKind } from "./fanBladeOrnamentAssets.js";

export interface FanBladeRingStyle {
  torusColor: string;
  torusEmissive: string;
  metalness: number;
  roughness: number;
  kinds: FanBladeOrnamentKind[];
  ornamentScale: number;
}

export const FAN_BLADE_RING_STYLES: Record<FanBladeFrameId, FanBladeRingStyle> = {
  rose_gold_ring: {
    torusColor: "#d4a574",
    torusEmissive: "#3a2218",
    metalness: 0.92,
    roughness: 0.18,
    kinds: ["rose", "sparkle", "rose", "sparkle", "rose", "sparkle", "rose", "sparkle"],
    ornamentScale: 0.22,
  },
  pearl_ring: {
    torusColor: "#e8ecf0",
    torusEmissive: "#1a2030",
    metalness: 0.96,
    roughness: 0.08,
    kinds: ["pearl", "sparkle", "pearl", "pearl", "sparkle", "pearl", "pearl", "sparkle", "pearl", "pearl"],
    ornamentScale: 0.18,
  },
  classic_black_ring: {
    torusColor: "#b8922e",
    torusEmissive: "#120e08",
    metalness: 0.94,
    roughness: 0.14,
    kinds: ["filigree", "sparkle", "filigree", "star", "filigree", "sparkle", "filigree", "star"],
    ornamentScale: 0.2,
  },
  sage_garden_ring: {
    torusColor: "#8fad86",
    torusEmissive: "#142018",
    metalness: 0.78,
    roughness: 0.28,
    kinds: ["leaf", "rose", "leaf", "leaf", "rose", "leaf", "leaf", "rose", "leaf", "leaf"],
    ornamentScale: 0.21,
  },
  royal_navy_ring: {
    torusColor: "#c9a227",
    torusEmissive: "#0a1020",
    metalness: 0.93,
    roughness: 0.16,
    kinds: ["star", "filigree", "star", "sparkle", "star", "filigree", "star", "sparkle"],
    ornamentScale: 0.19,
  },
};

function drawShadow(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number): void {
  ctx.save();
  ctx.filter = "blur(6px)";
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  ctx.ellipse(cx, cy + 8, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawRose(ctx: CanvasRenderingContext2D, size: number, seed: number): void {
  const cx = size * 0.5;
  const cy = size * 0.48;

  const petals = 8;
  for (let i = 0; i < petals; i += 1) {
    const angle = (i / petals) * Math.PI * 2 + seed * 0.4;
    const px = cx + Math.cos(angle) * size * 0.11;
    const py = cy + Math.sin(angle) * size * 0.1;
    const grad = ctx.createRadialGradient(px - 4, py - 6, 2, px, py, size * 0.14);
    grad.addColorStop(0, "#ffdce4");
    grad.addColorStop(0.45, "#f472b6");
    grad.addColorStop(1, "#be123c");
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(angle + Math.PI / 2);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(0, -size * 0.12);
    ctx.bezierCurveTo(size * 0.08, -size * 0.04, size * 0.08, size * 0.08, 0, size * 0.12);
    ctx.bezierCurveTo(-size * 0.08, size * 0.08, -size * 0.08, -size * 0.04, 0, -size * 0.12);
    ctx.fill();
    ctx.restore();
  }

  const coreGrad = ctx.createRadialGradient(cx - 3, cy - 4, 1, cx, cy, size * 0.08);
  coreGrad.addColorStop(0, "#fff7ed");
  coreGrad.addColorStop(0.5, "#fda4af");
  coreGrad.addColorStop(1, "#881337");
  ctx.fillStyle = coreGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.075, 0, Math.PI * 2);
  ctx.fill();
}

function drawPearl(ctx: CanvasRenderingContext2D, size: number): void {
  const cx = size * 0.5;
  const cy = size * 0.52;
  drawShadow(ctx, cx, cy, size * 0.14, size * 0.05);

  const bodyGrad = ctx.createRadialGradient(cx - size * 0.08, cy - size * 0.1, size * 0.02, cx, cy, size * 0.16);
  bodyGrad.addColorStop(0, "#ffffff");
  bodyGrad.addColorStop(0.35, "#eef2f7");
  bodyGrad.addColorStop(0.72, "#b8c2cc");
  bodyGrad.addColorStop(1, "#6b7280");
  ctx.fillStyle = bodyGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.15, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.beginPath();
  ctx.ellipse(cx - size * 0.05, cy - size * 0.06, size * 0.045, size * 0.028, -0.6, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(255,255,255,0.25)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.145, 0.2, Math.PI * 0.95);
  ctx.stroke();
}

function drawLeaf(ctx: CanvasRenderingContext2D, size: number, seed: number): void {
  const cx = size * 0.5;
  const cy = size * 0.52;
  drawShadow(ctx, cx, cy, size * 0.16, size * 0.06);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(seed * 0.8);
  const grad = ctx.createLinearGradient(0, -size * 0.16, 0, size * 0.16);
  grad.addColorStop(0, "#d9f0d4");
  grad.addColorStop(0.5, "#7fb07a");
  grad.addColorStop(1, "#3f6b4a");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(0, -size * 0.16);
  ctx.bezierCurveTo(size * 0.16, -size * 0.08, size * 0.14, size * 0.12, 0, size * 0.16);
  ctx.bezierCurveTo(-size * 0.14, size * 0.12, -size * 0.16, -size * 0.08, 0, -size * 0.16);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, -size * 0.12);
  ctx.lineTo(0, size * 0.12);
  ctx.stroke();
  ctx.restore();
}

function drawFiligree(ctx: CanvasRenderingContext2D, size: number, seed: number): void {
  const cx = size * 0.5;
  const cy = size * 0.5;
  drawShadow(ctx, cx, cy, size * 0.12, size * 0.05);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(seed * 0.5);
  const strokeGrad = ctx.createLinearGradient(-size * 0.12, 0, size * 0.12, 0);
  strokeGrad.addColorStop(0, "#8a6420");
  strokeGrad.addColorStop(0.5, "#f5e6b8");
  strokeGrad.addColorStop(1, "#8a6420");
  ctx.strokeStyle = strokeGrad;
  ctx.lineWidth = 2.4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-size * 0.12, 0);
  ctx.bezierCurveTo(-size * 0.04, -size * 0.12, size * 0.04, size * 0.12, size * 0.12, 0);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(-size * 0.08, -size * 0.04, size * 0.035, 0, Math.PI * 2);
  ctx.arc(size * 0.08, size * 0.04, size * 0.035, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawStar(ctx: CanvasRenderingContext2D, size: number): void {
  const cx = size * 0.5;
  const cy = size * 0.5;
  drawShadow(ctx, cx, cy, size * 0.1, size * 0.04);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = "rgba(245, 230, 184, 0.35)";
  ctx.beginPath();
  for (let i = 0; i < 5; i += 1) {
    const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(a) * size * 0.14;
    const y = Math.sin(a) * size * 0.14;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  const grad = ctx.createRadialGradient(-4, -4, 1, 0, 0, size * 0.12);
  grad.addColorStop(0, "#fff9e8");
  grad.addColorStop(0.55, "#f5e6b8");
  grad.addColorStop(1, "#a67c00");
  ctx.fillStyle = grad;
  ctx.beginPath();
  for (let i = 0; i < 5; i += 1) {
    const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(a) * size * 0.1;
    const y = Math.sin(a) * size * 0.1;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawSparkle(ctx: CanvasRenderingContext2D, size: number): void {
  const cx = size * 0.5;
  const cy = size * 0.5;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.shadowColor = "rgba(255, 220, 160, 0.8)";
  ctx.shadowBlur = 8;
  const grad = ctx.createLinearGradient(0, -size * 0.1, 0, size * 0.1);
  grad.addColorStop(0, "#fff8e7");
  grad.addColorStop(0.5, "#f0d090");
  grad.addColorStop(1, "#fff8e7");
  ctx.strokeStyle = grad;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, -size * 0.1);
  ctx.lineTo(0, size * 0.1);
  ctx.moveTo(-size * 0.1, 0);
  ctx.lineTo(size * 0.1, 0);
  ctx.stroke();
  ctx.restore();
}

const ornamentImageCache = new Map<FanBladeOrnamentKind, HTMLImageElement>();

function loadOrnamentImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Ornament asset failed: ${url}`));
    image.src = url;
  });
}

/** Preload Nano Banana Pro PNG ornaments from public assets (no-op if missing). */
export async function preloadFanBladeOrnamentAssets(
  baseDir?: string
): Promise<number> {
  const kinds: FanBladeOrnamentKind[] = ["rose", "pearl", "leaf", "filigree", "star", "sparkle"];
  let loaded = 0;
  await Promise.all(
    kinds.map(async (kind) => {
      if (ornamentImageCache.has(kind)) {
        loaded += 1;
        return;
      }
      try {
        const image = await loadOrnamentImage(fanBladeOrnamentAssetUrl(kind, baseDir));
        ornamentImageCache.set(kind, image);
        loaded += 1;
      } catch {
        // Canvas fallback remains available.
      }
    })
  );
  return loaded;
}

export function hasOrnamentAsset(kind: FanBladeOrnamentKind): boolean {
  return ornamentImageCache.has(kind);
}

export interface OrnamentCropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Rose boutonniere PNGs include stem/shadow — keep bloom rows only. */
export function detectRoseHeadCropRect(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  alphaThreshold = 40
): OrnamentCropRect | null {
  let y0 = height;
  let y1 = 0;
  let x0 = width;
  let x1 = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3]! > alphaThreshold) {
        y0 = Math.min(y0, y);
        y1 = Math.max(y1, y);
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
      }
    }
  }
  if (y1 <= y0 || x1 <= x0) {
    return null;
  }

  const rowCount = y1 - y0 + 1;
  const rowWidths = new Float32Array(rowCount);
  let peak = 0;
  for (let r = 0; r < rowCount; r += 1) {
    let count = 0;
    const y = y0 + r;
    for (let x = x0; x <= x1; x += 1) {
      if (data[(y * width + x) * 4 + 3]! > alphaThreshold) {
        count += 1;
      }
    }
    rowWidths[r] = count;
    peak = Math.max(peak, count);
  }
  if (peak <= 0) {
    return null;
  }

  let peakRow = 0;
  for (let r = 0; r < rowCount; r += 1) {
    if (rowWidths[r]! >= peak) {
      peakRow = r;
    }
  }

  const upperLimit = Math.max(peakRow, Math.floor(rowCount * 0.42));
  let headBottom = 0;
  for (let r = 0; r <= upperLimit; r += 1) {
    if (rowWidths[r]! >= peak * 0.85) {
      headBottom = r;
    }
  }

  if (headBottom < peakRow * 0.5) {
    let streak = 0;
    for (let r = peakRow + 1; r < Math.min(rowCount, peakRow + 120); r += 1) {
      if (rowWidths[r]! < peak * 0.88) {
        streak += 1;
        if (streak >= 5) {
          headBottom = r - 5;
          break;
        }
      } else {
        streak = 0;
      }
    }
  }

  let headTop = headBottom;
  for (let r = 0; r <= headBottom; r += 1) {
    if (rowWidths[r]! >= peak * 0.35) {
      headTop = r;
      break;
    }
  }

  const headY0 = y0 + headTop;
  const headY1 = y0 + headBottom;
  let hx0 = width;
  let hx1 = 0;
  for (let y = headY0; y <= headY1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      if (data[(y * width + x) * 4 + 3]! > alphaThreshold) {
        hx0 = Math.min(hx0, x);
        hx1 = Math.max(hx1, x);
      }
    }
  }
  if (hx1 <= hx0) {
    return null;
  }

  const pad = Math.max(2, Math.round(Math.max(hx1 - hx0, headY1 - headY0) * 0.04));
  return {
    x: Math.max(0, hx0 - pad),
    y: Math.max(0, headY0 - pad),
    w: Math.min(width, hx1 - hx0 + 1 + pad * 2),
    h: Math.min(height, headY1 - headY0 + 1 + pad * 2),
  };
}

export function trimRoseHeadOnly(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
): OrnamentCropRect | null {
  const imageData = ctx.getImageData(0, 0, width, height);
  const crop = detectRoseHeadCropRect(imageData.data, width, height);
  if (!crop) {
    return null;
  }
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (y < crop.y || y >= crop.y + crop.h || x < crop.x || x >= crop.x + crop.w) {
        imageData.data[(y * width + x) * 4 + 3] = 0;
      }
    }
  }
  ctx.putImageData(imageData, 0, 0);
  return crop;
}

function drawOrnamentAsset(
  ctx: CanvasRenderingContext2D,
  size: number,
  kind: FanBladeOrnamentKind
): boolean {
  const image = ornamentImageCache.get(kind);
  if (!image) {
    return false;
  }
  const pad = size * 0.06;

  if (kind === "rose") {
    const scratch = document.createElement("canvas");
    scratch.width = image.width;
    scratch.height = image.height;
    const scratchCtx = scratch.getContext("2d");
    if (!scratchCtx) {
      return false;
    }
    scratchCtx.drawImage(image, 0, 0);
    applyOrnamentBackgroundMatte(scratchCtx, scratch.width);
    trimRoseHeadOnly(scratchCtx, scratch.width, scratch.height);
    const matteData = scratchCtx.getImageData(0, 0, scratch.width, scratch.height);
    const crop = detectRoseHeadCropRect(matteData.data, scratch.width, scratch.height);
    if (crop) {
      ctx.drawImage(
        scratch,
        crop.x,
        crop.y,
        crop.w,
        crop.h,
        pad,
        pad,
        size - pad * 2,
        size - pad * 2
      );
    } else {
      ctx.drawImage(scratch, pad, pad, size - pad * 2, size - pad * 2);
    }
    return true;
  }

  ctx.drawImage(image, pad, pad, size - pad * 2, size - pad * 2);
  applyOrnamentBackgroundMatte(ctx, size);
  return true;
}

/** Flood-remove studio gray/white connected to canvas edges (Gemini PNGs are often opaque). */
export function applyOrnamentBackgroundMatte(
  ctx: CanvasRenderingContext2D,
  size: number,
  tolerance = 34
): void {
  const imageData = ctx.getImageData(0, 0, size, size);
  const { data, width, height } = imageData;
  const idx = (x: number, y: number) => (y * width + x) * 4;

  const cornerIdx = [idx(0, 0), idx(width - 1, 0), idx(0, height - 1), idx(width - 1, height - 1)];
  let br = 0;
  let bg = 0;
  let bb = 0;
  for (const i of cornerIdx) {
    br += data[i]!;
    bg += data[i + 1]!;
    bb += data[i + 2]!;
  }
  br /= 4;
  bg /= 4;
  bb /= 4;

  const isBgLike = (i: number) => {
    const dr = data[i]! - br;
    const dg = data[i + 1]! - bg;
    const db = data[i + 2]! - bb;
    const dist = Math.sqrt(dr * dr + dg * dg + db * db);
    const sat = Math.max(data[i]!, data[i + 1]!, data[i + 2]!) - Math.min(data[i]!, data[i + 1]!, data[i + 2]!);
    return dist < tolerance || (dist < tolerance + 18 && sat < 26) || (dist < 58 && sat < 34);
  };

  const mask = new Uint8Array(width * height);
  const queue: number[] = [];

  const trySeed = (x: number, y: number) => {
    const p = y * width + x;
    if (mask[p]) {
      return;
    }
    const i = idx(x, y);
    if (!isBgLike(i)) {
      return;
    }
    mask[p] = 1;
    queue.push(x, y);
  };

  for (let x = 0; x < width; x += 1) {
    trySeed(x, 0);
    trySeed(x, height - 1);
  }
  for (let y = 0; y < height; y += 1) {
    trySeed(0, y);
    trySeed(width - 1, y);
  }

  for (let q = 0; q < queue.length; q += 2) {
    const x = queue[q]!;
    const y = queue[q + 1]!;
    for (const [nx, ny] of [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ]) {
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
        continue;
      }
      trySeed(nx, ny);
    }
  }

  const t0 = tolerance * 0.35;
  const t1 = tolerance * 0.85;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const p = y * width + x;
      const i = idx(x, y);
      const dr = data[i]! - br;
      const dg = data[i + 1]! - bg;
      const db = data[i + 2]! - bb;
      const dist = Math.sqrt(dr * dr + dg * dg + db * db);
      let alpha = data[i + 3]! / 255;
      if (mask[p]) {
        alpha = 0;
      } else if (dist < tolerance + 14) {
        const feather = Math.max(0, Math.min(1, (dist - t0) / Math.max(t1 - t0, 0.001)));
        alpha = Math.min(alpha, feather);
      }
      data[i + 3] = Math.round(alpha * 255);
    }
  }

  ctx.putImageData(imageData, 0, 0);
}

export function drawFanBladeOrnament(
  ctx: CanvasRenderingContext2D,
  size: number,
  kind: FanBladeOrnamentKind,
  seed = 0
): void {
  ctx.clearRect(0, 0, size, size);
  if (drawOrnamentAsset(ctx, size, kind)) {
    return;
  }
  switch (kind) {
    case "rose":
      drawRose(ctx, size, seed);
      break;
    case "pearl":
      drawPearl(ctx, size);
      break;
    case "leaf":
      drawLeaf(ctx, size, seed);
      break;
    case "filigree":
      drawFiligree(ctx, size, seed);
      break;
    case "star":
      drawStar(ctx, size);
      break;
    case "sparkle":
      drawSparkle(ctx, size);
      break;
    default:
      drawSparkle(ctx, size);
  }
}

export function createFanBladeOrnamentCanvas(
  kind: FanBladeOrnamentKind,
  size = 256,
  seed = 0
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas 2D unavailable for fan-blade ornaments.");
  }
  drawFanBladeOrnament(ctx, size, kind, seed);
  return canvas;
}

export function getFanBladeRingStyle(frameId: FanBladeFrameId): FanBladeRingStyle {
  return FAN_BLADE_RING_STYLES[frameId] ?? FAN_BLADE_RING_STYLES.rose_gold_ring;
}
