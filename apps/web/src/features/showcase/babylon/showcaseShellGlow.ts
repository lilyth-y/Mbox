import { GlowLayer } from "@babylonjs/core/Layers/glowLayer";

import type { Mesh } from "@babylonjs/core/Meshes/mesh";

import type { Scene } from "@babylonjs/core/scene";

import type { ShowcasePipelineStageId } from "../pipeline/types";

import type { PhotoCrystalShapeId } from "./photoCrystalShapeCatalog";

import { getConvexShellPhotoTuning } from "./photoCrystalShapeFactory";

import { getShowcaseBackgroundLightingState } from "./showcaseBackgroundState";



let glowLayer: GlowLayer | null = null;

const trackedShells = new Set<Mesh>();



/** Bloom-like glow on crystal shell only — inner photo stays sharp. */

export function createShowcaseShellGlow(scene: Scene): void {

  if (glowLayer) {

    return;

  }



  glowLayer = new GlowLayer("jewel-shell-glow", scene, {

    mainTextureRatio: 0.4,

    blurKernelSize: 40,

  });

  glowLayer.intensity = 0.62;



  glowLayer.customEmissiveColorSelector = (mesh, _subMesh, _material, result) => {

    if (trackedShells.has(mesh)) {

      result.set(1, 1, 1, 1);

      return;

    }

    result.set(0, 0, 0, 0);

  };

}



export function bindShowcaseShellGlow(

  shellMesh: Mesh | null,

  innerShellMesh?: Mesh | null

): void {

  if (!glowLayer) {

    return;

  }



  for (const mesh of trackedShells) {

    glowLayer.removeIncludedOnlyMesh(mesh);

  }

  trackedShells.clear();



  for (const mesh of [shellMesh, innerShellMesh]) {

    if (!mesh) {

      continue;

    }

    glowLayer.addIncludedOnlyMesh(mesh);

    glowLayer.referenceMeshToUseItsOwnMaterial(mesh);

    trackedShells.add(mesh);

  }

}



export function tickShowcaseShellGlow(

  power: number,

  stageId: ShowcasePipelineStageId,

  shapeId?: PhotoCrystalShapeId

): void {

  if (!glowLayer) {

    return;

  }



  const convexGlow = getConvexShellPhotoTuning(shapeId ?? "cube").glowMul;



  let intensity = 0.56 + power * 0.58;

  if (stageId === "pull" || stageId === "ascend") {

    intensity += 0.42;

  } else if (stageId === "reveal") {

    intensity += power * 0.22;

  }



  glowLayer.intensity = Math.min(
    1.12,
    intensity * getShowcaseBackgroundLightingState().glowMul * convexGlow
  );

}



export function disposeShowcaseShellGlow(): void {

  if (glowLayer) {

    glowLayer.dispose();

    glowLayer = null;

  }

  trackedShells.clear();

}


