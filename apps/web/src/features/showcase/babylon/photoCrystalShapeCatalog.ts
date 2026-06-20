import { HOLOGRAM_DISPLAY_SPEC } from "@mbox/shared";
import { OUTER_SIZE } from "./jewelCubeMaterials";
import { computePhotoCrystalPortraitLayout } from "./photoCrystalPortraitLayout";
import { getInnerCubePhotoSize } from "./jewelPhotoInnerMesh";

export type PhotoCrystalShapeId =
  | "cube"
  | "tall_rect"
  | "hex_prism"
  | "heart"
  | "sphere"
  | "gem_prism";

export type PhotoCrystalPhotoMode = "cube" | "portrait";

export type PhotoCrystalPhotoLayoutId = "auto" | PhotoCrystalPhotoMode;

export type PhotoCrystalShapeSpec = {
  id: PhotoCrystalShapeId;
  labelKo: string;
  /** Visual-only scale relative to base OUTER_SIZE. */
  outerScale: { x: number; y: number; z: number };
  /** Six-face cube vs single front portrait (laser-etched look). */
  photoMode: PhotoCrystalPhotoMode;
  /** Preferred portrait width / height — plate is fit inside shell bounds. */
  portraitAspect: number;
  /** Local offset (× OUTER_SIZE) for portrait centering inside silhouette. */
  portraitOffset: { x: number; y: number; z: number };
  /** Max visual dimension for camera framing (× OUTER_SIZE). */
  framingExtent: number;
  pullFramingFill: number;
};

/**
 * Reference-driven catalog template (based on provided product photos).
 * This list is the “main catalog” set you mentioned.
 */
export const PHOTO_CRYSTAL_SHAPES: PhotoCrystalShapeSpec[] = [
  {
    id: "cube",
    labelKo: "큐브",
    outerScale: { x: 1, y: 1, z: 1 },
    photoMode: "cube",
    portraitAspect: 0.82,
    portraitOffset: { x: 0, y: 0, z: 0 },
    framingExtent: 1.05,
    pullFramingFill: HOLOGRAM_DISPLAY_SPEC.pullPhotoViewportFill,
  },
  {
    id: "tall_rect",
    labelKo: "직육면체(세로)",
    outerScale: { x: 0.78, y: 1.55, z: 0.78 },
    photoMode: "portrait",
    portraitAspect: 0.82,
    portraitOffset: { x: 0, y: 0.02, z: 0 },
    framingExtent: 1.42,
    pullFramingFill: HOLOGRAM_DISPLAY_SPEC.pullPhotoViewportFill,
  },
  {
    id: "hex_prism",
    labelKo: "육각 프리즘",
    outerScale: { x: 1.05, y: 1.15, z: 0.62 },
    photoMode: "portrait",
    portraitAspect: 0.85,
    portraitOffset: { x: 0, y: 0, z: 0 },
    framingExtent: 1.18,
    pullFramingFill: HOLOGRAM_DISPLAY_SPEC.pullPhotoViewportFill,
  },
  {
    id: "heart",
    labelKo: "하트",
    outerScale: { x: 1.12, y: 1.12, z: 0.5 },
    photoMode: "portrait",
    portraitAspect: 0.92,
    portraitOffset: { x: 0, y: 0.02, z: 0 },
    framingExtent: 1.28,
    pullFramingFill: HOLOGRAM_DISPLAY_SPEC.pullPhotoViewportFill,
  },
  {
    id: "sphere",
    labelKo: "구(볼)",
    outerScale: { x: 1.05, y: 1.05, z: 1.05 },
    photoMode: "portrait",
    portraitAspect: 0.86,
    portraitOffset: { x: 0, y: 0, z: 0 },
    framingExtent: 1.12,
    pullFramingFill: HOLOGRAM_DISPLAY_SPEC.pullPhotoViewportFill,
  },
  {
    id: "gem_prism",
    labelKo: "보석 프리즘",
    outerScale: { x: 1.05, y: 1.25, z: 0.72 },
    photoMode: "portrait",
    portraitAspect: 0.8,
    portraitOffset: { x: 0, y: 0.05, z: 0 },
    framingExtent: 1.28,
    pullFramingFill: HOLOGRAM_DISPLAY_SPEC.pullPhotoViewportFill,
  },
];

export function resolvePhotoCrystalShape(id: string | null | undefined): PhotoCrystalShapeSpec {
  const match = PHOTO_CRYSTAL_SHAPES.find((s) => s.id === id);
  return match ?? PHOTO_CRYSTAL_SHAPES[0]!;
}

/** Bounding size passed to `computeShowcaseFramingRadius`. */
export function getPhotoCrystalFramingExtent(shapeId: PhotoCrystalShapeId | string): number {
  const shape = resolvePhotoCrystalShape(shapeId);
  return OUTER_SIZE * shape.framingExtent;
}

export function getPhotoCrystalPullFramingFill(
  shapeId: PhotoCrystalShapeId | string,
  fallback: number
): number {
  const shape = resolvePhotoCrystalShape(shapeId);
  return shape.pullFramingFill ?? fallback;
}

/** World-space photo span for hero pull (1:1 square envelope, centered). */
export function getPhotoCrystalPullPhotoExtent(
  shapeId: PhotoCrystalShapeId,
  layout: PhotoCrystalPhotoMode
): number {
  if (layout === "cube") {
    return getInnerCubePhotoSize(shapeId);
  }
  const portrait = computePhotoCrystalPortraitLayout(shapeId);
  return Math.max(portrait.width, portrait.height);
}

