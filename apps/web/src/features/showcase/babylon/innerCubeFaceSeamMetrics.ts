import type { PhotoCrystalShapeId } from "./photoCrystalShapeCatalog";
import { getCubePhotoCavityMetrics } from "./jewelPhotoInnerMesh.ts";

/** Half-edge of each inner photo plane (world units). */
export function innerCubeFaceHalfExtent(edgeSize: number): number {
  return edgeSize * 0.5;
}

/**
 * Radial gap between face mount (±faceHalf) and plane half-extent.
 * Must be ≤ 0 for a watertight inner cube (0 = flush, <0 = overlap).
 */
export function innerCubeFaceRadialGap(faceHalf: number, edgeSize: number): number {
  return faceHalf - innerCubeFaceHalfExtent(edgeSize);
}

/** Two adjacent faces share an edge when both half-extents reach the joint axis. */
export function innerCubeEdgeJointCoverage(faceHalf: number, edgeSize: number): number {
  const half = innerCubeFaceHalfExtent(edgeSize);
  return Math.min(half / Math.max(faceHalf, 1e-9), 1);
}

export type InnerCubeFaceSeamReport = {
  shapeId: PhotoCrystalShapeId;
  edgeSize: number;
  faceHalf: number;
  halfExtent: number;
  radialGap: number;
  jointCoverage: number;
  seamClosed: boolean;
};

export function analyzeInnerCubeFaceSeams(
  shapeId: PhotoCrystalShapeId = "cube"
): InnerCubeFaceSeamReport {
  const { edgeSize, faceHalf } = getCubePhotoCavityMetrics(shapeId);
  const halfExtent = innerCubeFaceHalfExtent(edgeSize);
  const radialGap = innerCubeFaceRadialGap(faceHalf, edgeSize);
  const jointCoverage = innerCubeEdgeJointCoverage(faceHalf, edgeSize);
  return {
    shapeId,
    edgeSize,
    faceHalf,
    halfExtent,
    radialGap,
    jointCoverage,
    seamClosed: halfExtent + 1e-12 >= faceHalf,
  };
}

/** Required plane edge length for zero radial gap at a given mount half-edge. */
export function requiredInnerCubeEdgeSize(faceHalf: number): number {
  return faceHalf * 2;
}
