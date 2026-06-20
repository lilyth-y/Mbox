import { OUTER_SIZE } from "./jewelCubeMaterials";
import { BRILLIANT_CUT_FACE_INSET_RATIO, getBrilliantCutFlatSpan } from "./crystalShellMesh";
import type { PhotoCrystalShapeId } from "./photoCrystalShapeCatalog";
import { resolvePhotoCrystalShape } from "./photoCrystalShapeCatalog";
import { computeHeartTableBounds, getHeartGemMetrics } from "./heartGemGeometry";

/** Flat-table / outer span — synced with `buildBrilliantCutCubeVertexData`. */
export const SHELL_FLAT_CAVITY_RATIO = 1 - 2 * BRILLIANT_CUT_FACE_INSET_RATIO;
/** Convex prism interior — slightly inset from vertex shell. */
export const SHELL_PRISM_CAVITY_RATIO = 0.93;
/** Inner shell wall clone scale — tight to outer shell (avoids visible air gap). */
export const SHELL_INNER_WALL_INSET = 0.985;

export function shellFlatCavitySpan(outerSpan: number): number {
  return getBrilliantCutFlatSpan(outerSpan);
}

/** Shell mesh constants — must stay in sync with `photoCrystalShapeFactory`. */
export const SPHERE_SHELL_RADIUS = OUTER_SIZE * 0.52;

export const HEX_PRISM_SHELL = {
  height: OUTER_SIZE * 1.05,
  diameter: OUTER_SIZE * 1.02,
  sides: 6,
} as const;
export const GEM_PRISM_SHELL = {
  height: OUTER_SIZE * 1.15,
  diameterTop: OUTER_SIZE * 0.78,
  diameterBottom: OUTER_SIZE * 0.92,
  sides: 10,
} as const;

/** Flat-to-flat width of a regular prism face (Babylon cylinder diameter = vertex span). */
export function polygonFlatWidth(diameter: number, sides: number): number {
  return diameter * Math.cos(Math.PI / sides);
}

/** Center → front flat facet along +Z. */
export function polygonFaceDepth(diameter: number, sides: number, scaleZ = 1): number {
  return (diameter * 0.5) * Math.cos(Math.PI / sides) * scaleZ;
}

/** Fit a portrait plate inside a rectangular front face. */
export function fitPortraitToBounds(
  maxWidth: number,
  maxHeight: number,
  aspect: number,
  fill = 0.9
): { width: number; height: number } {
  const boundsW = Math.max(maxWidth * fill, 0.001);
  const boundsH = Math.max(maxHeight * fill, 0.001);
  let height = boundsH;
  let width = height * aspect;
  if (width > boundsW) {
    width = boundsW;
    height = width / aspect;
  }
  return { width, height };
}

/** Fit portrait inside a circular front projection (sphere). */
export function fitPortraitInCircle(
  radius: number,
  aspect: number,
  margin = 0.9
): { width: number; height: number } {
  const plate = fitPortraitToBounds(2 * radius, 2 * radius, aspect, margin);
  const R = radius * margin;
  const hw = plate.width * 0.5;
  const hh = plate.height * 0.5;
  const dist = Math.hypot(hw, hh);
  if (dist > R && dist > 1e-6) {
    const scale = R / dist;
    return { width: plate.width * scale, height: plate.height * scale };
  }
  return plate;
}

export type ShapeInnerVolumeBounds = {
  maxWidth: number;
  maxHeight: number;
  centerY: number;
  fill: number;
  useCircleFit: boolean;
};

/** Usable portrait region inside the crystal volume (centered at origin). */
export function getShapeInnerVolumeBounds(
  shapeId: PhotoCrystalShapeId,
  volumeFill = 1
): ShapeInnerVolumeBounds {
  const shape = resolvePhotoCrystalShape(shapeId);
  const sx = shape.outerScale.x;
  const sy = shape.outerScale.y;
  const sz = shape.outerScale.z;

  switch (shapeId) {
    case "sphere": {
      const r = SPHERE_SHELL_RADIUS * Math.max(sx, sy, sz) * SHELL_INNER_WALL_INSET * volumeFill;
      return {
        maxWidth: 2 * r,
        maxHeight: 2 * r,
        centerY: 0,
        fill: 0.99,
        useCircleFit: true,
      };
    }
    case "heart": {
      const tableRadius = getHeartGemMetrics().tableRadius * SHELL_FLAT_CAVITY_RATIO * volumeFill;
      const bounds = computeHeartTableBounds(tableRadius);
      return {
        maxWidth: bounds.width * sx,
        maxHeight: bounds.height * sy,
        centerY: bounds.centerY * sy,
        fill: 0.99,
        useCircleFit: false,
      };
    }
    case "hex_prism": {
      const flatW =
        polygonFlatWidth(HEX_PRISM_SHELL.diameter, HEX_PRISM_SHELL.sides) *
        sx *
        SHELL_PRISM_CAVITY_RATIO *
        volumeFill;
      const h = HEX_PRISM_SHELL.height * sy * SHELL_PRISM_CAVITY_RATIO * volumeFill;
      return {
        maxWidth: flatW,
        maxHeight: h,
        centerY: 0,
        fill: 0.99,
        useCircleFit: false,
      };
    }
    case "gem_prism": {
      const avgD = (GEM_PRISM_SHELL.diameterTop + GEM_PRISM_SHELL.diameterBottom) * 0.5;
      const flatW =
        polygonFlatWidth(avgD, GEM_PRISM_SHELL.sides) * sx * SHELL_PRISM_CAVITY_RATIO * volumeFill;
      const bodyH = GEM_PRISM_SHELL.height * sy * SHELL_PRISM_CAVITY_RATIO * volumeFill;
      return {
        maxWidth: flatW,
        maxHeight: bodyH * 0.96,
        centerY: bodyH * 0.04,
        fill: 0.99,
        useCircleFit: false,
      };
    }
    case "tall_rect":
      return {
        maxWidth: shellFlatCavitySpan(OUTER_SIZE * sx) * volumeFill,
        maxHeight: shellFlatCavitySpan(OUTER_SIZE * sy) * volumeFill,
        centerY: 0,
        fill: 0.99,
        useCircleFit: false,
      };
    case "cube":
    default:
      return {
        maxWidth: shellFlatCavitySpan(OUTER_SIZE * sx) * volumeFill,
        maxHeight: shellFlatCavitySpan(OUTER_SIZE * sy) * volumeFill,
        centerY: 0,
        fill: 0.99,
        useCircleFit: false,
      };
  }
}

/** Face plane depth inside brilliant-cut flat table (× outer half-span). */
const INNER_PHOTO_FACE_DEPTH_MUL = 0.965;

/** Etched photo anchor — sized and positioned inside the shell cavity (not on the outer surface). */
export type ShapeInnerPhotoAnchor = ShapeFrontFaceBounds;

export function getShapeInnerPhotoAnchor(shapeId: PhotoCrystalShapeId): ShapeInnerPhotoAnchor {
  const shape = resolvePhotoCrystalShape(shapeId);
  const sx = shape.outerScale.x;
  const sy = shape.outerScale.y;
  const sz = shape.outerScale.z;
  const inner = getShapeInnerVolumeBounds(shapeId);
  const offsetX = shape.portraitOffset.x * OUTER_SIZE;
  const offsetY = shape.portraitOffset.y * OUTER_SIZE;

  switch (shapeId) {
    case "sphere":
      return {
        maxWidth: inner.maxWidth,
        maxHeight: inner.maxHeight,
        center: { x: offsetX, y: offsetY, z: 0 },
        fill: inner.fill,
        useCircleFit: true,
      };
    case "heart":
      return {
        maxWidth: inner.maxWidth,
        maxHeight: inner.maxHeight,
        center: { x: offsetX, y: inner.centerY + offsetY, z: 0 },
        fill: inner.fill,
        useCircleFit: false,
      };
    case "hex_prism": {
      const innerZ =
        polygonFaceDepth(HEX_PRISM_SHELL.diameter, HEX_PRISM_SHELL.sides, sz) *
        SHELL_PRISM_CAVITY_RATIO *
        SHELL_INNER_WALL_INSET;
      return {
        maxWidth: inner.maxWidth,
        maxHeight: inner.maxHeight,
        center: { x: offsetX, y: offsetY, z: innerZ },
        fill: inner.fill,
        useCircleFit: false,
      };
    }
    case "gem_prism": {
      const avgD = (GEM_PRISM_SHELL.diameterTop + GEM_PRISM_SHELL.diameterBottom) * 0.5;
      const innerZ =
        polygonFaceDepth(avgD, GEM_PRISM_SHELL.sides, sz) *
        SHELL_PRISM_CAVITY_RATIO *
        SHELL_INNER_WALL_INSET;
      return {
        maxWidth: inner.maxWidth,
        maxHeight: inner.maxHeight,
        center: { x: offsetX, y: inner.centerY + offsetY, z: innerZ },
        fill: inner.fill,
        useCircleFit: false,
      };
    }
    case "tall_rect": {
      const innerZ =
        shellFlatCavitySpan(OUTER_SIZE * sz) * 0.5 * SHELL_INNER_WALL_INSET;
      return {
        maxWidth: inner.maxWidth,
        maxHeight: inner.maxHeight,
        center: { x: offsetX, y: offsetY, z: innerZ },
        fill: inner.fill,
        useCircleFit: false,
      };
    }
    case "cube":
    default: {
      const innerZ =
        shellFlatCavitySpan(OUTER_SIZE * Math.max(sx, sy, sz)) *
        0.5 *
        SHELL_INNER_WALL_INSET *
        INNER_PHOTO_FACE_DEPTH_MUL;
      return {
        maxWidth: inner.maxWidth,
        maxHeight: inner.maxHeight,
        center: { x: offsetX, y: offsetY, z: innerZ },
        fill: inner.fill,
        useCircleFit: false,
      };
    }
  }
}

export type ShapeFrontFaceBounds = {
  maxWidth: number;
  maxHeight: number;
  center: { x: number; y: number; z: number };
  fill: number;
  useCircleFit: boolean;
};

export function getShapeFrontFaceBounds(shapeId: PhotoCrystalShapeId): ShapeFrontFaceBounds {
  const shape = resolvePhotoCrystalShape(shapeId);
  const sx = shape.outerScale.x;
  const sy = shape.outerScale.y;
  const sz = shape.outerScale.z;
  const offsetX = shape.portraitOffset.x * OUTER_SIZE;
  const offsetY = shape.portraitOffset.y * OUTER_SIZE;

  switch (shapeId) {
    case "sphere": {
      const r = SPHERE_SHELL_RADIUS * Math.max(sx, sy, sz);
      return {
        maxWidth: 2 * r,
        maxHeight: 2 * r,
        center: { x: offsetX, y: offsetY, z: r * sz },
        fill: 0.88,
        useCircleFit: true,
      };
    }
    case "hex_prism": {
      const flatW = polygonFlatWidth(HEX_PRISM_SHELL.diameter, HEX_PRISM_SHELL.sides) * sx;
      const h = HEX_PRISM_SHELL.height * sy;
      return {
        maxWidth: flatW,
        maxHeight: h,
        center: {
          x: offsetX,
          y: offsetY,
          z: polygonFaceDepth(HEX_PRISM_SHELL.diameter, HEX_PRISM_SHELL.sides, sz),
        },
        fill: 0.9,
        useCircleFit: false,
      };
    }
    case "gem_prism": {
      const avgD = (GEM_PRISM_SHELL.diameterTop + GEM_PRISM_SHELL.diameterBottom) * 0.5;
      const flatW = polygonFlatWidth(avgD, GEM_PRISM_SHELL.sides) * sx;
      const bodyH = GEM_PRISM_SHELL.height * sy;
      return {
        maxWidth: flatW,
        maxHeight: bodyH * 0.9,
        center: {
          x: offsetX,
          y: bodyH * 0.04 + offsetY,
          z: polygonFaceDepth(avgD, GEM_PRISM_SHELL.sides, sz) * 0.95,
        },
        fill: 0.88,
        useCircleFit: false,
      };
    }
    case "heart": {
      const tableRadius = getHeartGemMetrics().tableRadius * SHELL_FLAT_CAVITY_RATIO;
      const bounds = computeHeartTableBounds(tableRadius);
      return {
        maxWidth: bounds.width * sx,
        maxHeight: bounds.height * sy,
        center: { x: offsetX, y: bounds.centerY + offsetY, z: 0 },
        fill: 0.94,
        useCircleFit: false,
      };
    }
    case "tall_rect":
      return {
        maxWidth: OUTER_SIZE * sx,
        maxHeight: OUTER_SIZE * sy,
        center: {
          x: offsetX,
          y: offsetY,
          z: OUTER_SIZE * sz * 0.5,
        },
        fill: 0.9,
        useCircleFit: false,
      };
    default:
      return {
        maxWidth: OUTER_SIZE * sx,
        maxHeight: OUTER_SIZE * sy,
        center: {
          x: offsetX,
          y: offsetY,
          z: OUTER_SIZE * sz * 0.5,
        },
        fill: 0.86,
        useCircleFit: false,
      };
  }
}
