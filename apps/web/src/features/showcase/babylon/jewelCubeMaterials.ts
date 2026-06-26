import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Material } from "@babylonjs/core/Materials/material";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";

import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";

import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture";

import type { Scene } from "@babylonjs/core/scene";

import { CUBE_FACE_UV_INSET, HOLOGRAM_DISPLAY_SPEC } from "@mbox/shared";

const OUTER_SIZE = 1.85;

/** Photo core — flat faces inside the shell (faithful original colors). */
const INNER_SIZE = 1.46;

export function createInnerPhotoMaterial(
  scene: Scene,
  photoTexture: BaseTexture,
  useAlpha = false
): StandardMaterial {
  const mat = new StandardMaterial(`jewel-inner-photo-${photoTexture.uniqueId}`, scene);
  applyInnerPhotoTextures(mat, photoTexture, useAlpha);
  return mat;
}

/**
 * Unlit photo — single emissive path (no diffuse+emissive double wash).
 * Babylon StandardMaterial needs emissive for reliable unlit display.
 */
export function applyInnerPhotoTextures(
  material: StandardMaterial,
  photoTexture: BaseTexture,
  useAlpha = false
): void {
  material.diffuseTexture = null;
  material.emissiveTexture = photoTexture;
  material.emissiveColor = new Color3(1, 1, 1);
  material.diffuseColor = new Color3(0, 0, 0);
  material.specularColor = new Color3(0, 0, 0);
  material.ambientColor = new Color3(0, 0, 0);
  material.disableLighting = true;
  material.backFaceCulling = true;
  if (useAlpha) {
    material.diffuseTexture = photoTexture;
    material.useAlphaFromDiffuseTexture = true;
    material.transparencyMode = Material.MATERIAL_ALPHABLEND;
    material.alpha = 1;
  } else {
    material.diffuseTexture = null;
    material.useAlphaFromDiffuseTexture = false;
    material.transparencyMode = Material.MATERIAL_OPAQUE;
    material.alpha = 1;
  }
}

export function setInnerPhotoLayerAlpha(material: StandardMaterial, alpha: number): void {
  const a = Math.max(0, Math.min(1, alpha));
  material.alpha = a;
  material.transparencyMode = a < 0.999 ? Material.MATERIAL_ALPHABLEND : Material.MATERIAL_OPAQUE;
}

/** L1 — brilliant-cut crystal shell: gloss + env reflection (no SS refraction — breaks some GPUs). */
export function createCrystalShellMaterial(
  scene: Scene,
  applyReflection: (material: PBRMaterial) => void
): PBRMaterial {
  const spec = HOLOGRAM_DISPLAY_SPEC;
  const mat = new PBRMaterial("jewel-shell", scene);

  mat.albedoColor = new Color3(0.99, 1, 1);
  mat.metallic = 0;
  mat.roughness = 0.008;
  mat.alpha = spec.paperweightShellAlpha;
  mat.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
  mat.indexOfRefraction = spec.paperweightIor;

  mat.subSurface.isRefractionEnabled = false;
  mat.subSurface.isDispersionEnabled = false;

  mat.clearCoat.isEnabled = true;
  mat.clearCoat.intensity = 1;
  mat.clearCoat.roughness = 0.006;
  mat.specularIntensity = 1.4;
  mat.backFaceCulling = false;
  mat.emissiveColor = new Color3(0, 0, 0);
  mat.usePhysicalLightFalloff = true;

  applyReflection(mat);
  return mat;
}

import type { Mesh } from "@babylonjs/core/Meshes/mesh";

export function configureCrystalShellEdges(_shell: Mesh): void {
  /* EdgesRenderer on brilliant-cut mesh reads as harsh corner wires — use shader rim only. */
}

/** Inset factor for photo planes — sits in the flat core behind facet pyramids. */
export function getJewelPhotoFaceInset(): number {
  return 1 - CUBE_FACE_UV_INSET * 1.35;
}

export { OUTER_SIZE, INNER_SIZE };
