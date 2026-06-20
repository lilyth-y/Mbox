import type { JewelCubePhysicsRig } from "./jewelCubeFactory";

export function applyJewelCrystalScale(rig: JewelCubePhysicsRig, sizeScale: number): void {
  const scale = Math.max(0.55, Math.min(1.45, sizeScale));
  rig.crystalSizeScale = scale;
  rig.collider.scaling.set(scale, scale, scale);
}
