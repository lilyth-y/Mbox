import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture";
import type { Scene } from "@babylonjs/core/scene";
import {
  applyInnerPhotoTextures,
  createInnerPhotoMaterial,
  setInnerPhotoLayerAlpha,
} from "./jewelCubeMaterials";
import {
  applyJewelInnerPhotoMaterial,
  createJewelInnerPhotoMaterial,
  setJewelInnerPhotoAlpha,
  type JewelInnerPhotoMaterial,
  type JewelInnerPhotoMaterialOptions,
} from "./jewelInnerPhotoMaterial";

export type JewelPhotoDisplayMaterial = JewelInnerPhotoMaterial | StandardMaterial;

import { isLocalGpuSession } from "../../../shared/lib/gpuSession";

export function shouldUseStandardJewelPhotoPreview(
  options: Pick<
    JewelInnerPhotoMaterialOptions,
    "cubeFace" | "silhouetteKind" | "circleMask"
  > = {}
): boolean {
  // Custom shader UV / silhouette clip — StandardMaterial is a solid frame wash.
  if (options.cubeFace) {
    return false;
  }
  if (options.circleMask) {
    return false;
  }
  if ((options.silhouetteKind ?? 0) !== 0) {
    return false;
  }
  return isLocalGpuSession();
}

export function isStandardJewelPhotoMaterial(
  material: JewelPhotoDisplayMaterial
): material is StandardMaterial {
  return material instanceof StandardMaterial;
}

export function createJewelPhotoDisplayMaterial(
  scene: Scene,
  photoTexture: BaseTexture,
  options: JewelInnerPhotoMaterialOptions
): JewelPhotoDisplayMaterial {
  if (shouldUseStandardJewelPhotoPreview(options)) {
    return createInnerPhotoMaterial(scene, photoTexture, options.useAlpha ?? false);
  }
  return createJewelInnerPhotoMaterial(scene, photoTexture, options);
}

export function applyJewelPhotoDisplayMaterial(
  material: JewelPhotoDisplayMaterial,
  photoTexture: BaseTexture,
  options: JewelInnerPhotoMaterialOptions
): void {
  if (isStandardJewelPhotoMaterial(material)) {
    applyInnerPhotoTextures(material, photoTexture, options.useAlpha ?? false);
    return;
  }
  applyJewelInnerPhotoMaterial(material, photoTexture, options);
}

export function setJewelPhotoDisplayAlpha(material: JewelPhotoDisplayMaterial, alpha: number): void {
  if (isStandardJewelPhotoMaterial(material)) {
    setInnerPhotoLayerAlpha(material, alpha);
    return;
  }
  setJewelInnerPhotoAlpha(material, alpha);
}
