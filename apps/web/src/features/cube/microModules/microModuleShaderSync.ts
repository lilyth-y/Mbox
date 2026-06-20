import * as THREE from "three";

export function syncHologramRimUniforms(
  root: THREE.Object3D,
  enabled: boolean,
  rimTime: number
): void {
  const rimEnabled = enabled ? 1.0 : 0.0;
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) {
      return;
    }
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (!(material instanceof THREE.ShaderMaterial)) {
        continue;
      }
      const uniforms = material.uniforms;
      if (!uniforms?.uHologramRimEnabled || !uniforms?.uHologramRimTime) {
        continue;
      }
      uniforms.uHologramRimEnabled.value = rimEnabled;
      uniforms.uHologramRimTime.value = rimTime;
    }
  });
}
