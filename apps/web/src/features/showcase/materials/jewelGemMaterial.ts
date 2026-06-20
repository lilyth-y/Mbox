import * as THREE from "three";

/** Faceted gem material for corner/edge jewel meshes. */
export function createJewelGemMaterial(): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(0xd8f4ff),
    metalness: 0.08,
    roughness: 0.04,
    transmission: 0.72,
    thickness: 0.65,
    ior: 1.62,
    clearcoat: 1,
    clearcoatRoughness: 0.02,
    emissive: new THREE.Color(0x224466),
    emissiveIntensity: 0.35,
    envMapIntensity: 1.6,
    transparent: true,
    opacity: 0.94,
    side: THREE.DoubleSide,
  });
}

export function pulseJewelGemMaterial(
  material: THREE.MeshPhysicalMaterial,
  pulse: number,
  timeSec: number
): void {
  const p = Math.max(0, Math.min(1, pulse));
  material.emissiveIntensity = 0.28 + p * 0.55 + Math.sin(timeSec * 6) * 0.06 * p;
  material.envMapIntensity = 1.4 + p * 0.9;
}
