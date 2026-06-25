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

import { isLocalGpuExportSession } from "../../../shared/lib/renderExportProfile";

export function shouldUseStandardJewelPhotoPreview(): boolean {
  // Custom photo shaders + parallel compile race → CONTEXT_LOST on ANGLE export; StandardMaterial is stable.
  return isLocalGpuExportSession();
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
  if (shouldUseStandardJewelPhotoPreview()) {
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
