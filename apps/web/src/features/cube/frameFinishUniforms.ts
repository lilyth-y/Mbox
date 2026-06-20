import type { CubeFrameFinishId } from "@mbox/shared";

export type FrameFinishUniforms = {
  uFrameFinish: { value: number };
};

/** 0 = glossy, 1 = wood, 2 = none (shader skips frame composite) */
export function frameFinishUniformValue(finishId: CubeFrameFinishId): number {
  if (finishId === "wood") return 1;
  if (finishId === "none") return 2;
  return 0;
}

export function createFrameFinishUniforms(
  finishId: CubeFrameFinishId = "glossy"
): FrameFinishUniforms {
  return {
    uFrameFinish: { value: frameFinishUniformValue(finishId) },
  };
}

export function setFrameFinishUniform(
  uniforms: FrameFinishUniforms,
  finishId: CubeFrameFinishId
): void {
  uniforms.uFrameFinish.value = frameFinishUniformValue(finishId);
}

export function frameFinishStandardMaterialProps(finishId: CubeFrameFinishId): {
  metalness: number;
  roughness: number;
  clearcoat: number;
  clearcoatRoughness: number;
  envMapIntensity: number;
} {
  if (finishId === "none") {
    return { metalness: 0, roughness: 1, clearcoat: 0, clearcoatRoughness: 1, envMapIntensity: 0 };
  }
  if (finishId === "wood") {
    return {
      metalness: 0.05,
      roughness: 0.82,
      clearcoat: 0.18,
      clearcoatRoughness: 0.62,
      envMapIntensity: 0.45,
    };
  }
  return {
    metalness: 0.96,
    roughness: 0.05,
    clearcoat: 1,
    clearcoatRoughness: 0.028,
    envMapIntensity: 1.4,
  };
}

export function isFrameBorderVisible(finishId: CubeFrameFinishId): boolean {
  return finishId !== "none";
}
