import type { JewelCubePhysicsRig } from "./jewelCubeFactory";
import { getPhotoCrystalFramingExtent } from "./photoCrystalShapeCatalog";
import type { PhotoCrystalShapeId } from "./photoCrystalShapeCatalog";

export function clampJewelCrystalSizeScale(sizeScale: number): number {
  return Math.max(0.55, Math.min(1.45, sizeScale));
}

export function getJewelCrystalFramingExtent(
  shapeId: PhotoCrystalShapeId,
  sizeScale: number
): number {
  return getPhotoCrystalFramingExtent(shapeId) * clampJewelCrystalSizeScale(sizeScale);
}

/** Only call on reveal spawn or catalog size slider — not during stage ticks. */
export function applyJewelCrystalScale(rig: JewelCubePhysicsRig, sizeScale: number): void {
  const scale = clampJewelCrystalSizeScale(sizeScale);
  rig.crystalSizeScale = scale;
  rig.collider.scaling.set(scale, scale, scale);
}

export function readJewelCrystalUniformScale(rig: JewelCubePhysicsRig): number {
  const s = rig.collider.scaling;
  return (s.x + s.y + s.z) / 3;
}

export function jewelCrystalScaleIsUniform(rig: JewelCubePhysicsRig, epsilon = 1e-5): boolean {
  const s = rig.collider.scaling;
  return (
    Math.abs(s.x - s.y) <= epsilon &&
    Math.abs(s.y - s.z) <= epsilon &&
    Math.abs(s.x - rig.crystalSizeScale) <= epsilon
  );
}
