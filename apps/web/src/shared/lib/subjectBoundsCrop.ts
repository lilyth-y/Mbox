import { DEPTH_GRID_SIZE } from "@mbox/shared";
import type { DepthField, ImageCenter, ProcessedImage, SubjectBounds } from "../types";
import { computeCropBounds } from "./cropBounds";

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

function ensureMinSpan(bounds: SubjectBounds, minSpan = 12): SubjectBounds {
  let { x0, y0, x1, y1 } = bounds;
  if (x1 - x0 < minSpan) {
    const cx = (x0 + x1) / 2;
    x0 = cx - minSpan / 2;
    x1 = cx + minSpan / 2;
  }
  if (y1 - y0 < minSpan) {
    const cy = (y0 + y1) / 2;
    y0 = cy - minSpan / 2;
    y1 = cy + minSpan / 2;
  }
  return {
    x0: clampPercent(x0),
    y0: clampPercent(y0),
    x1: clampPercent(x1),
    y1: clampPercent(y1),
  };
}

/** Portrait-ish fallback when bounds fall outside the square crop — wide enough for couples. */
export function defaultFaceSubjectBounds(): SubjectBounds {
  return { x0: 16, y0: 10, x1: 84, y1: 92 };
}

/** True when bounds describe a subject region, not the full frame. */
export function hasUsefulSubjectBounds(bounds: SubjectBounds): boolean {
  const width = bounds.x1 - bounds.x0;
  const height = bounds.y1 - bounds.y0;
  const area = width * height;
  return width >= 10 && height >= 12 && area >= 150 && area <= 85 * 85;
}

/**
 * Map analysis bounds (0–100 on original image) into cropped face texture space.
 */
export function remapSubjectBoundsForSquareCrop(
  imageWidth: number,
  imageHeight: number,
  crop: { sx: number; sy: number; size: number },
  bounds: SubjectBounds
): SubjectBounds {
  if (crop.size <= 0 || imageWidth <= 0 || imageHeight <= 0) {
    return ensureMinSpan(defaultFaceSubjectBounds());
  }

  const mapX = (pct: number) =>
    (((pct / 100) * imageWidth - crop.sx) / crop.size) * 100;
  const mapY = (pct: number) =>
    (((pct / 100) * imageHeight - crop.sy) / crop.size) * 100;

  let x0 = mapX(bounds.x0);
  let x1 = mapX(bounds.x1);
  let y0 = mapY(bounds.y0);
  let y1 = mapY(bounds.y1);
  if (x0 > x1) {
    [x0, x1] = [x1, x0];
  }
  if (y0 > y1) {
    [y0, y1] = [y1, y0];
  }

  x0 = clampPercent(x0);
  x1 = clampPercent(x1);
  y0 = clampPercent(y0);
  y1 = clampPercent(y1);

  if (x1 <= 2 || x0 >= 98 || y1 <= 2 || y0 >= 98 || x1 - x0 < 4 || y1 - y0 < 4) {
    return ensureMinSpan(defaultFaceSubjectBounds());
  }

  return ensureMinSpan({ x0, y0, x1, y1 });
}

export function remapCenterForSquareCrop(
  imageWidth: number,
  imageHeight: number,
  crop: { sx: number; sy: number; size: number },
  center: ImageCenter
): ImageCenter {
  if (crop.size <= 0) {
    return center;
  }
  const mapX = (pct: number) =>
    (((pct / 100) * imageWidth - crop.sx) / crop.size) * 100;
  const mapY = (pct: number) =>
    (((pct / 100) * imageHeight - crop.sy) / crop.size) * 100;
  return {
    x: clampPercent(mapX(center.x)),
    y: clampPercent(mapY(center.y)),
  };
}

function distanceToBounds(point: { x: number; y: number }, bounds: SubjectBounds): number {
  const dx =
    point.x < bounds.x0 ? bounds.x0 - point.x : point.x > bounds.x1 ? point.x - bounds.x1 : 0;
  const dy =
    point.y < bounds.y0 ? bounds.y0 - point.y : point.y > bounds.y1 ? point.y - bounds.y1 : 0;
  return Math.hypot(dx, dy);
}

/** Same model as API depth synthesis — white=near subject, black=far. */
export function synthesizeDepthField(
  center: ImageCenter,
  bounds: SubjectBounds,
  gridSize = DEPTH_GRID_SIZE
): DepthField {
  const values: number[] = [];
  let subjectDepth = 0.75;

  for (let row = 0; row < gridSize; row += 1) {
    for (let col = 0; col < gridSize; col += 1) {
      const x = ((col + 0.5) / gridSize) * 100;
      const y = ((row + 0.5) / gridSize) * 100;
      const distance = distanceToBounds({ x, y }, bounds);
      const normalizedDistance = clampPercent(distance / 50);
      const depth = clampPercent(1 - normalizedDistance * 0.85);
      values.push(depth);

      if (Math.abs(x - center.x) < 100 / gridSize && Math.abs(y - center.y) < 100 / gridSize) {
        subjectDepth = depth;
      }
    }
  }

  return { gridSize, subjectDepth, values };
}

async function loadImageElement(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    if (!url.startsWith("data:")) {
      image.crossOrigin = "anonymous";
    }
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to load image for bounds remap."));
    image.src = url;
  });
}

/** Face-texture bounds for VoluMax matte / depth (remaps from pre-crop analysis when possible). */
export async function resolveFaceSubjectBounds(
  image: Pick<
    ProcessedImage,
    "preCropSourceUrl" | "originalUrl" | "center" | "focus" | "subject"
  >
): Promise<SubjectBounds> {
  const raw = image.subject.bounds;
  const source = image.preCropSourceUrl ?? image.originalUrl;
  if (!source) {
    return hasUsefulSubjectBounds(raw) ? ensureMinSpan(raw) : defaultFaceSubjectBounds();
  }

  const img = await loadImageElement(source);
  const crop = computeCropBounds(
    img.width,
    img.height,
    image.center,
    image.focus,
    image.subject.bounds
  );
  const remapped = remapSubjectBoundsForSquareCrop(img.width, img.height, crop, raw);
  return hasUsefulSubjectBounds(remapped) ? remapped : defaultFaceSubjectBounds();
}

export async function resolveFaceCenterAndBounds(
  image: Pick<
    ProcessedImage,
    "preCropSourceUrl" | "originalUrl" | "center" | "focus" | "subject"
  >
): Promise<{ center: ImageCenter; bounds: SubjectBounds; depth: DepthField }> {
  const source = image.preCropSourceUrl ?? image.originalUrl;
  if (!source) {
    const bounds = hasUsefulSubjectBounds(image.subject.bounds)
      ? ensureMinSpan(image.subject.bounds)
      : defaultFaceSubjectBounds();
    const center = image.center;
    return { center, bounds, depth: synthesizeDepthField(center, bounds) };
  }

  const img = await loadImageElement(source);
  const crop = computeCropBounds(
    img.width,
    img.height,
    image.center,
    image.focus,
    image.subject.bounds
  );
  const bounds = remapSubjectBoundsForSquareCrop(img.width, img.height, crop, image.subject.bounds);
  const center = remapCenterForSquareCrop(img.width, img.height, crop, image.center);
  const safeBounds = hasUsefulSubjectBounds(bounds) ? bounds : defaultFaceSubjectBounds();
  return {
    center,
    bounds: safeBounds,
    depth: synthesizeDepthField(center, safeBounds),
  };
}
