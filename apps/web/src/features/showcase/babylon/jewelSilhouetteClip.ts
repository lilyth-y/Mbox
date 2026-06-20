import type { PhotoSilhouetteKind } from "./photoCrystalPhotoProfile";
import type { PhotoCrystalShapeId } from "./photoCrystalShapeCatalog";
import {
  computeHeartTableBounds,
  heartPoint2D,
} from "./heartGemGeometry";
import { getHeartTablePhotoRadius } from "./jewelPhotoInnerMesh";

/** Matches shader polygonSilhouetteDist circumradius in [-1,1] space. */
const POLYGON_RADIUS = 0.9;

/** Matches shader circleSilhouetteDist — inscribed circle in unit UV square. */
const CIRCLE_RADIUS_UV = 0.5;

const HEART_CLIP_SEGMENTS = 72;

export type JewelSilhouetteClipSpec = {
  kind: PhotoSilhouetteKind;
  polygonSides?: number;
  shapeId?: PhotoCrystalShapeId;
};

export function shouldBakeSilhouetteClip(
  spec: JewelSilhouetteClipSpec,
  options: { preCropped: boolean; preserveAlpha: boolean }
): boolean {
  if (options.preserveAlpha || !options.preCropped) {
    return false;
  }
  return spec.kind !== "rect";
}

/** Append a closed path in canvas pixel space (caller should ctx.clip()). */
export function appendJewelSilhouettePath(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  spec: JewelSilhouetteClipSpec
): boolean {
  switch (spec.kind) {
    case "circle":
      appendCirclePath(ctx, width, height);
      return true;
    case "heart":
      appendHeartTablePath(ctx, width, height, spec.shapeId ?? "heart");
      return true;
    case "polygon":
      appendPolygonPath(ctx, width, height, spec.polygonSides ?? 6);
      return true;
    default:
      return false;
  }
}

function canvasPoint(width: number, height: number, uvx: number, uvy: number): [number, number] {
  return [uvx * width, (1 - uvy) * height];
}

function appendCirclePath(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const r = Math.min(width, height) * CIRCLE_RADIUS_UV;
  ctx.arc(width / 2, height / 2, r, 0, Math.PI * 2);
}

/**
 * Flat-top hex uses the same UV swap as `polygonSilhouetteDist` in the photo shader.
 * Other regular polygons use pointy-top orientation in [-1,1] UV space.
 */
function appendPolygonPath(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  sides: number
): void {
  const isFlatTopHex = Math.abs(sides - 6) < 0.5;
  const pts: Array<[number, number]> = [];

  for (let i = 0; i < sides; i++) {
    const angle = Math.PI / 2 + (i * 2 * Math.PI) / sides;
    const px = POLYGON_RADIUS * Math.cos(angle);
    const py = POLYGON_RADIUS * Math.sin(angle);

    let uvx: number;
    let uvy: number;
    if (isFlatTopHex) {
      uvx = py / 2 + 0.5;
      uvy = px / 0.8660254 / 2 + 0.5;
    } else {
      uvx = px / 2 + 0.5;
      uvy = py / 2 + 0.5;
    }
    pts.push(canvasPoint(width, height, uvx, uvy));
  }

  ctx.moveTo(pts[0]![0], pts[0]![1]);
  for (let i = 1; i < pts.length; i++) {
    ctx.lineTo(pts[i]![0], pts[i]![1]);
  }
  ctx.closePath();
}

/**
 * Heart table UV matches `buildHeartTablePhotoVertexData` — bbox maps to texture 0..1.
 */
function appendHeartTablePath(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  shapeId: PhotoCrystalShapeId
): void {
  const tableRadius = getHeartTablePhotoRadius(shapeId);
  const bounds = computeHeartTableBounds(tableRadius);

  for (let i = 0; i <= HEART_CLIP_SEGMENTS; i++) {
    const t = (i / HEART_CLIP_SEGMENTS) * Math.PI * 2;
    const p = heartPoint2D(t, tableRadius);
    const u = (p.x - bounds.minX) / Math.max(bounds.width, 1e-5);
    const v = (p.y - bounds.minY) / Math.max(bounds.height, 1e-5);
    const [px, py] = canvasPoint(width, height, u, v);
    if (i === 0) {
      ctx.moveTo(px, py);
    } else {
      ctx.lineTo(px, py);
    }
  }
  ctx.closePath();
}
