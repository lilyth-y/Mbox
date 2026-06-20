import { Color3 } from "@babylonjs/core/Maths/math.color";

import { Vector3 } from "@babylonjs/core/Maths/math.vector";

import type { JewelCrystalShellMaterial } from "./shaders/jewelCrystalShellShader";

import { parseHexColor3 } from "./showcaseColorParse";

import { getShowcaseCatalogColorState } from "./showcaseCatalogColorState";

import type { CrystalHarmonyTuning } from "./showcaseCrystalHarmony";

import { getHarmonyInfluence } from "./showcaseHarmonyState";



const DEFAULT_CRYSTAL = new Color3(0.9, 0.96, 1);



import type { JewelCubePhysicsRig } from "./jewelCubeFactory";

import { applyConvexCrystalShellTuning } from "./shaders/jewelCrystalShellShader";



/** Push catalog crystal tint onto shell materials (works while paused too). */

export function applyShowcaseCrystalCatalogToShell(rig: JewelCubePhysicsRig): void {

  applyUserCrystalSurfaceColor(rig.shellMaterial);

  applyCrystalMediaReflectionStrength(rig.shellMaterial);

  applyConvexCrystalShellTuning(rig.shellMaterial, rig.shapeId);

  if (rig.shellInnerMaterial) {

    applyUserCrystalSurfaceColor(rig.shellInnerMaterial);

    applyCrystalMediaReflectionStrength(rig.shellInnerMaterial);

  }

}



/** User picker = crystal body / surface color only (not replaced by backdrop). */

export function applyUserCrystalSurfaceColor(material: JewelCrystalShellMaterial): void {

  const { crystalShellColorHex } = getShowcaseCatalogColorState();

  const surface = parseHexColor3(crystalShellColorHex, DEFAULT_CRYSTAL);

  material.setVector3("uIceTint", new Vector3(surface.r, surface.g, surface.b));

}



/** How strongly backdrop video/image appears in shell reflections (0–1). */

export function applyCrystalMediaReflectionStrength(material: JewelCrystalShellMaterial): void {

  const { crystalBackdropBlend } = getShowcaseCatalogColorState();

  const strength = Math.max(0, Math.min(1, getHarmonyInfluence() * crystalBackdropBlend));

  material.setFloat("uMediaReflection", strength);

}



/** @deprecated backdrop no longer tints surface color */

export function blendCrystalShellTint(

  harmonyTint: Color3,

  userHex: string,

  backdropBlend: number

): Color3 {

  const user = parseHexColor3(userHex, DEFAULT_CRYSTAL);

  void harmonyTint;

  void backdropBlend;

  return user;

}



/** @deprecated use applyUserCrystalSurfaceColor */

export function applyCrystalShellTintToMaterial(

  material: JewelCrystalShellMaterial,

  _harmonyTint: Color3

): void {

  applyUserCrystalSurfaceColor(material);

}



/** @deprecated use applyUserCrystalSurfaceColor */

export function applyCrystalShellTintFromTuning(

  material: JewelCrystalShellMaterial,

  _tuning: CrystalHarmonyTuning

): void {

  applyUserCrystalSurfaceColor(material);

}


