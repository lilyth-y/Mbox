import * as THREE from "three";

export function createCrystalShellMaterial(): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(0xf8fcff),
    metalness: 0,
    roughness: 0.02,
    transmission: 0.94,
    thickness: 1.35,
    ior: 1.52,
    clearcoat: 1,
    clearcoatRoughness: 0.015,
    transparent: true,
    opacity: 1,
    side: THREE.DoubleSide,
    depthWrite: false,
    envMapIntensity: 1.8,
  });
}

export function pulseCrystalShellMaterial(
  material: THREE.MeshPhysicalMaterial,
  pulse: number,
  timeSec: number
): void {
  const p = Math.max(0, Math.min(1, pulse));
  material.envMapIntensity = 1.5 + p * 1.4 + Math.sin(timeSec * 5.5) * 0.08 * p;
  material.clearcoatRoughness = Math.max(0.008, 0.02 - p * 0.01);
}
