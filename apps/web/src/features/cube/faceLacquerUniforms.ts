import * as THREE from "three";
import type { CubeFrameFinishId } from "@mbox/shared";

export type FaceLacquerUniforms = {
  uFaceLightDir: { value: THREE.Vector2 };
  uFaceGloss: { value: number };
  uFaceShowcasePulse: { value: number };
};

export function createFaceLacquerUniforms(
  finishId: CubeFrameFinishId = "glossy"
): FaceLacquerUniforms {
  void finishId;
  return {
    uFaceLightDir: { value: new THREE.Vector2(0.62, 0.38) },
    uFaceGloss: { value: 0 },
    uFaceShowcasePulse: { value: 0 },
  };
}

export function faceGlossStrength(finishId: CubeFrameFinishId): number {
  if (finishId === "none") return 0;
  if (finishId === "wood") return 0.38;
  return 0.72;
}

/** Face planes stay matte — gloss is on the 3D cube shell only. */
export function setFaceLacquerLight(
  uniforms: FaceLacquerUniforms,
  _rotationY: number,
  _rotationX: number,
  _showcasePulse: number = 0,
  _finishId: CubeFrameFinishId = "glossy"
): void {
  uniforms.uFaceLightDir.value.set(0.58, 0.42);
  uniforms.uFaceGloss.value = 0;
  uniforms.uFaceShowcasePulse.value = 0;
}

export function setFaceLacquerUniformsOnMaterial(
  material: THREE.Material,
  rotationY: number,
  rotationX: number,
  showcasePulse: number,
  finishId: CubeFrameFinishId
): void {
  if (!(material instanceof THREE.ShaderMaterial) || !material.uniforms?.uFaceLightDir) {
    return;
  }
  setFaceLacquerLight(
    material.uniforms as FaceLacquerUniforms,
    rotationY,
    rotationX,
    showcasePulse,
    finishId
  );
}

export function applyFaceLacquerLightToRoot(
  root: THREE.Object3D,
  rotationY: number,
  rotationX: number,
  showcasePulse: number,
  finishId: CubeFrameFinishId
): void {
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) {
      return;
    }
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      setFaceLacquerUniformsOnMaterial(
        material,
        rotationY,
        rotationX,
        showcasePulse,
        finishId
      );
    }
  });
}
