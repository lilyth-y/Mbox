import { Jimp } from "jimp";
import type { SubjectBounds } from "./types.js";

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

export function normalizeSubjectBounds(bounds: Partial<SubjectBounds> | undefined): SubjectBounds {
  const x0 = clampPercent(Number(bounds?.x0));
  const y0 = clampPercent(Number(bounds?.y0));
  const x1 = clampPercent(Number(bounds?.x1));
  const y1 = clampPercent(Number(bounds?.y1));

  if (Number.isFinite(x0) && Number.isFinite(y0) && Number.isFinite(x1) && Number.isFinite(y1) && x1 > x0 + 2 && y1 > y0 + 2) {
    return { x0, y0, x1, y1 };
  }

  const inset = 14;
  return { x0: inset, y0: inset, x1: 100 - inset, y1: 100 - inset };
}

function ellipseAlpha(
  x: number,
  y: number,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  featherPx: number
): number {
  const nx = (x - cx) / rx;
  const ny = (y - cy) / ry;
  const radial = Math.sqrt(nx * nx + ny * ny);
  if (radial <= 1) {
    return 1;
  }
  const edgeDistancePx = (radial - 1) * Math.min(rx, ry);
  return Math.max(0, 1 - edgeDistancePx / Math.max(featherPx, 1));
}

/** Seoul-safe cutout: elliptical matte from analysis bounds (no Vertex image model). */
export async function removeBackgroundWithMatte(
  imageBase64: string,
  bounds: Partial<SubjectBounds> | undefined,
  mimeType = "image/png"
): Promise<{ imageBase64: string; mimeType: string }> {
  const buffer = Buffer.from(imageBase64, "base64");
  const image = await Jimp.read(buffer);
  const normalized = normalizeSubjectBounds(bounds);
  const width = image.bitmap.width;
  const height = image.bitmap.height;

  const x0 = (normalized.x0 / 100) * width;
  const y0 = (normalized.y0 / 100) * height;
  const x1 = (normalized.x1 / 100) * width;
  const y1 = (normalized.y1 / 100) * height;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const rx = Math.max((x1 - x0) / 2, 4);
  const ry = Math.max((y1 - y0) / 2, 4);
  const featherPx = Math.max(Math.min(width, height) * 0.035, 6);

  image.scan(0, 0, width, height, (x, y, index) => {
    const alpha = ellipseAlpha(x, y, cx, cy, rx, ry, featherPx);
    image.bitmap.data[index + 3] = Math.round(alpha * 255);
  });

  const output =
    mimeType === "image/jpeg"
      ? await image.getBuffer("image/png")
      : await image.getBuffer("image/png");

  return {
    imageBase64: output.toString("base64"),
    mimeType: "image/png",
  };
}
