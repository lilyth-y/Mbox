import type { PhotoCrystalPhotoMode, PhotoCrystalShapeId } from "./photoCrystalShapeCatalog";

export type PrismOrbitConfig = {
  sweepRadius: number;
  sweepHeight: number;
  sweepHeightWobble: number;
  sweepSpeed: number;
};

const DEFAULT_ORBIT: PrismOrbitConfig = {
  sweepRadius: 6.2,
  sweepHeight: 1.6,
  sweepHeightWobble: 0.9,
  sweepSpeed: 1.05,
};

const CUBE_ORBIT: PrismOrbitConfig = {
  sweepRadius: 5.8,
  sweepHeight: 1.35,
  sweepHeightWobble: 0.75,
  sweepSpeed: 1.12,
};

const GEM_PRISM_ORBIT: PrismOrbitConfig = {
  sweepRadius: 5.6,
  sweepHeight: 0.18,
  sweepHeightWobble: 0.22,
  sweepSpeed: 0.78,
};

const SPHERE_ORBIT: PrismOrbitConfig = {
  sweepRadius: 6.4,
  sweepHeight: 1.1,
  sweepHeightWobble: 1.05,
  sweepSpeed: 0.95,
};

const HEART_ORBIT: PrismOrbitConfig = {
  sweepRadius: 5.9,
  sweepHeight: 1.45,
  sweepHeightWobble: 0.82,
  sweepSpeed: 1.02,
};

const HEX_ORBIT: PrismOrbitConfig = {
  sweepRadius: 6.0,
  sweepHeight: 1.25,
  sweepHeightWobble: 0.7,
  sweepSpeed: 0.88,
};

const INNER_CUBE_ORBIT: PrismOrbitConfig = {
  sweepRadius: 5.4,
  sweepHeight: 1.05,
  sweepHeightWobble: 0.55,
  sweepSpeed: 1.18,
};

export function getPhotoCrystalOrbitProfile(
  shapeId: PhotoCrystalShapeId,
  photoLayout: PhotoCrystalPhotoMode = "portrait"
): PrismOrbitConfig {
  if (photoLayout === "cube" && shapeId !== "cube") {
    return INNER_CUBE_ORBIT;
  }
  if (shapeId === "gem_prism") {
    return GEM_PRISM_ORBIT;
  }
  if (shapeId === "cube") {
    return CUBE_ORBIT;
  }
  if (shapeId === "sphere") {
    return SPHERE_ORBIT;
  }
  if (shapeId === "heart") {
    return HEART_ORBIT;
  }
  if (shapeId === "hex_prism") {
    return HEX_ORBIT;
  }
  return DEFAULT_ORBIT;
}
