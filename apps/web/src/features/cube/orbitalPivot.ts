import type * as THREE from "three";

export interface OrbitalPivotHandles {
  orbitGroup: THREE.Group;
  spinGroup: THREE.Group;
}

export const ORBITAL_PIVOT_USERDATA_KEY = "orbitalPivot";

export function readOrbitalPivot(root: THREE.Object3D): OrbitalPivotHandles | null {
  return (root.userData[ORBITAL_PIVOT_USERDATA_KEY] as OrbitalPivotHandles | undefined) ?? null;
}

export function applyOrbitalShowcaseRootTransform(
  root: THREE.Object3D,
  sample: {
    orbitAngleRad: number;
    spinAngleRad: number;
    tiltAngleRad: number;
    dockRollRad?: number;
    scale: number;
  }
): void {
  const dockRoll = sample.dockRollRad ?? 0;
  const pivot = readOrbitalPivot(root);
  if (!pivot) {
    root.rotation.set(sample.tiltAngleRad, sample.orbitAngleRad, sample.spinAngleRad * 0.22 + dockRoll);
    root.position.set(0, 0, 0);
    root.scale.set(sample.scale, sample.scale, sample.scale);
    return;
  }
  root.rotation.set(0, 0, 0);
  root.position.set(0, 0, 0);
  root.scale.set(1, 1, 1);
  pivot.orbitGroup.rotation.set(0, sample.orbitAngleRad, 0);
  pivot.orbitGroup.position.set(0, 0, 0);
  pivot.spinGroup.rotation.set(sample.tiltAngleRad, sample.spinAngleRad, dockRoll);
  pivot.spinGroup.position.set(0, 0, 0);
  pivot.spinGroup.scale.set(sample.scale, sample.scale, sample.scale);
}
