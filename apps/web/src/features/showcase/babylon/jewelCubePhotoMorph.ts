import type { HoloContentTextures } from "./holoContentTextures";
import {
  applyJewelPhotoDisplayMaterial,
  setJewelPhotoDisplayAlpha,
} from "./jewelPhotoMaterialBridge";
import { getInnerPhotoMaterialOptions } from "./jewelInnerPhotoMaterial";
import { getShowcaseCatalogColorState } from "./showcaseCatalogColorState";
import { parseHexColor3 } from "./showcaseColorParse";
import {
  getShowcasePhotoFrameColor3,
  isShowcasePhotoFrameEnabled,
  resolveShowcaseFramePresetForLayout,
} from "./showcasePhotoFrameColor";
import { getPhotoCrystalPhotoProfile, photoSilhouetteKindToShaderId } from "./photoCrystalPhotoProfile";
import { resolvePhotoCrystalShape } from "./photoCrystalShapeCatalog";
import type { JewelCubePhysicsRig } from "./jewelCubeFactory";
import { getHeartTablePhotoRadius } from "./jewelPhotoInnerMesh";
import { setJewelPhotoCoreLayerEnabled } from "./jewelPhotoCore";

export function jewelRigUsesPhotoMorphTwin(rig: JewelCubePhysicsRig): boolean {
  return rig.bgLayerB !== rig.bgLayerA;
}

export interface JewelPhotoMorphState {
  active: boolean;
  elapsedMs: number;
  durationMs: number;
}

/** Smooth 0→1 with flat shoulders — softer than quadratic easeInOut. */
function smootherstep(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x * x * x * (x * (x * 6 - 15) + 10);
}

/** Symmetric crossfade — both layers visible mid-morph (no late snap). */
function morphLayerAlphas(t: number): { current: number; next: number } {
  const u = smootherstep(t);
  return { current: 1 - u, next: u };
}

export function createJewelPhotoMorphState(): JewelPhotoMorphState {
  return { active: false, elapsedMs: 0, durationMs: 0 };
}

function materialOptions(rig: JewelCubePhysicsRig, useAlpha: boolean) {
  const profile = getPhotoCrystalPhotoProfile(rig.shapeId);
  const effectiveFramePreset = resolveShowcaseFramePresetForLayout(
    rig.framePresetId,
    rig.shapeId,
    rig.photoLayout
  );
  const frameEnabled = isShowcasePhotoFrameEnabled(effectiveFramePreset);
  const { photoFrameColorHex } = getShowcaseCatalogColorState();
  const frameColor = frameEnabled
    ? parseHexColor3(photoFrameColorHex, getShowcasePhotoFrameColor3(effectiveFramePreset))
    : undefined;
  const shapeSpec = resolvePhotoCrystalShape(rig.shapeId);
  return getInnerPhotoMaterialOptions(rig.shapeId, rig.photoLayout, useAlpha, {
    enabled: frameEnabled,
    color: frameColor,
    silhouetteKind: photoSilhouetteKindToShaderId(profile.silhouette),
    polygonSides: profile.polygonSides,
    heartScale: rig.shapeId === "heart" ? getHeartTablePhotoRadius(rig.shapeId) : undefined,
    ...(rig.photoLayout === "cube"
      ? { photoAspect: 1, photoViewportFill: 1, cubeFace: true, cubeBox: false }
      : {
          photoAspect: shapeSpec.portraitAspect,
          photoViewportFill: profile.photoViewportFill,
        }),
    cubeHalf: rig.photoLayout === "cube" ? rig.bgLayerA.cubeHalf : undefined,
  });
}

function applyHoloToLayerB(rig: JewelCubePhysicsRig, content: HoloContentTextures): void {
  const bgTex = content.hasDepthSplit ? content.background : content.composite;
  applyJewelPhotoDisplayMaterial(rig.bgMatB, bgTex, materialOptions(rig, false));
  if (content.hasDepthSplit && content.foreground && rig.fgMatB && rig.fgB) {
    applyJewelPhotoDisplayMaterial(rig.fgMatB, content.foreground, materialOptions(rig, true));
    setJewelPhotoCoreLayerEnabled(rig.fgLayerB!, true);
  } else if (rig.fgB) {
    setJewelPhotoCoreLayerEnabled(rig.fgLayerB!, false);
  }
}

function disableMorphTwinLayers(rig: JewelCubePhysicsRig): void {
  if (!jewelRigUsesPhotoMorphTwin(rig)) {
    return;
  }
  setJewelPhotoCoreLayerEnabled(rig.bgLayerB, false);
  if (rig.fgLayerB) {
    setJewelPhotoCoreLayerEnabled(rig.fgLayerB, false);
  }
}

function commitHoloToLayerA(rig: JewelCubePhysicsRig, content: HoloContentTextures): void {
  const bgTex = content.hasDepthSplit ? content.background : content.composite;
  applyJewelPhotoDisplayMaterial(rig.bgMatA, bgTex, materialOptions(rig, false));
  setJewelPhotoCoreLayerEnabled(rig.bgLayerA, true);
  if (content.hasDepthSplit && content.foreground && rig.fgMatA && rig.fgA) {
    applyJewelPhotoDisplayMaterial(rig.fgMatA, content.foreground, materialOptions(rig, true));
    setJewelPhotoCoreLayerEnabled(rig.fgLayerA!, true);
  } else if (rig.fgA) {
    setJewelPhotoCoreLayerEnabled(rig.fgLayerA!, false);
  }
  rig.hasDepthSplit = content.hasDepthSplit && content.foreground !== null;
  rig.photoTexture = content.composite;
}

export function startJewelPhotoMorph(
  rig: JewelCubePhysicsRig,
  nextContent: HoloContentTextures,
  durationMs: number,
  morph: JewelPhotoMorphState
): void {
  if (!jewelRigUsesPhotoMorphTwin(rig) || durationMs <= 0) {
    commitHoloToLayerA(rig, nextContent);
    setJewelPhotoDisplayAlpha(rig.bgMatA, 1);
    disableMorphTwinLayers(rig);
    if (rig.fgMatA) {
      setJewelPhotoDisplayAlpha(rig.fgMatA, 1);
    }
    morph.active = false;
    morph.elapsedMs = 0;
    return;
  }

  applyHoloToLayerB(rig, nextContent);
  setJewelPhotoDisplayAlpha(rig.bgMatA, 1);
  setJewelPhotoDisplayAlpha(rig.bgMatB, 0);
  setJewelPhotoCoreLayerEnabled(rig.bgLayerB, true);
  if (rig.fgMatA && rig.fgMatB) {
    setJewelPhotoDisplayAlpha(rig.fgMatA, 1);
    setJewelPhotoDisplayAlpha(rig.fgMatB, 0);
    setJewelPhotoCoreLayerEnabled(rig.fgLayerB!, true);
  }
  morph.active = true;
  morph.elapsedMs = 0;
  morph.durationMs = durationMs;
}

/** Returns true when morph finished. */
export function tickJewelPhotoMorph(
  rig: JewelCubePhysicsRig,
  dtMs: number,
  morph: JewelPhotoMorphState,
  nextContent?: HoloContentTextures
): boolean {
  if (!morph.active || !jewelRigUsesPhotoMorphTwin(rig)) {
    return true;
  }

  morph.elapsedMs += dtMs;
  const t = Math.min(1, morph.elapsedMs / Math.max(morph.durationMs, 1));
  const { current, next } = morphLayerAlphas(t);

  setJewelPhotoDisplayAlpha(rig.bgMatA, current);
  setJewelPhotoDisplayAlpha(rig.bgMatB, next);
  if (rig.fgMatA && rig.fgMatB) {
    setJewelPhotoDisplayAlpha(rig.fgMatA, current);
    setJewelPhotoDisplayAlpha(rig.fgMatB, next);
  }

  if (t >= 1) {
    const resolved: HoloContentTextures =
      nextContent ??
      ({
        composite: rig.photoTexture,
        background: rig.photoTexture,
        foreground: rig.hasDepthSplit ? rig.photoTexture : null,
        hasDepthSplit: rig.hasDepthSplit,
      } satisfies HoloContentTextures);
    commitHoloToLayerA(rig, resolved);
    setJewelPhotoDisplayAlpha(rig.bgMatA, 1);
    disableMorphTwinLayers(rig);
    morph.active = false;
    morph.elapsedMs = 0;
    return true;
  }

  return false;
}
