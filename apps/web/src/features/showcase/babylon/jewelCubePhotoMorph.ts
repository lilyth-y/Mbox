import type { HoloContentTextures } from "./holoContentTextures";
import { setJewelPhotoDisplayAlpha } from "./jewelPhotoMaterialBridge";
import type { JewelCubePhysicsRig } from "./jewelCubeFactory";
import { setJewelPhotoCoreLayerEnabled, applyHoloToJewelPhotoLayer, syncCubePullHeroTextures } from "./jewelPhotoCore";

export function jewelRigUsesPhotoMorphTwin(rig: JewelCubePhysicsRig): boolean {
  return rig.bgLayerB !== rig.bgLayerA;
}

export interface JewelPhotoMorphState {
  active: boolean;
  elapsedMs: number;
  durationMs: number;
  /** Portrait/heart: fade out → swap texture → fade in on layer A. */
  singleLayer?: boolean;
  midSwapped?: boolean;
}

/** Symmetric overlap crossfade — raised cosine, both layers visible mid-morph. */
function morphLayerAlphas(t: number): { current: number; next: number } {
  const x = Math.max(0, Math.min(1, t));
  const next = 0.5 - 0.5 * Math.cos(Math.PI * x);
  return { current: 1 - next, next };
}

export function createJewelPhotoMorphState(): JewelPhotoMorphState {
  return { active: false, elapsedMs: 0, durationMs: 0, singleLayer: false, midSwapped: false };
}

function applyHoloToLayerB(rig: JewelCubePhysicsRig, content: HoloContentTextures): void {
  applyHoloToJewelPhotoLayer(rig, rig.bgLayerB, content, false);
  if (content.hasDepthSplit && content.foreground && rig.fgLayerB) {
    applyHoloToJewelPhotoLayer(
      rig,
      rig.fgLayerB,
      {
        composite: content.foreground,
        background: content.background,
        foreground: content.foreground,
        hasDepthSplit: true,
      },
      true
    );
  } else if (rig.fgLayerB) {
    setJewelPhotoCoreLayerEnabled(rig.fgLayerB, false);
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
  applyHoloToJewelPhotoLayer(rig, rig.bgLayerA, content, false);
  if (content.hasDepthSplit && content.foreground && rig.fgLayerA) {
    applyHoloToJewelPhotoLayer(
      rig,
      rig.fgLayerA,
      {
        composite: content.foreground,
        background: content.background,
        foreground: content.foreground,
        hasDepthSplit: true,
      },
      true
    );
  } else if (rig.fgLayerA) {
    setJewelPhotoCoreLayerEnabled(rig.fgLayerA, false);
  }
  rig.hasDepthSplit = content.hasDepthSplit && content.foreground !== null;
  rig.photoTexture = content.composite;
  syncCubePullHeroTextures(rig, content);
}

export function startJewelPhotoMorph(
  rig: JewelCubePhysicsRig,
  nextContent: HoloContentTextures,
  durationMs: number,
  morph: JewelPhotoMorphState
): void {
  if (!jewelRigUsesPhotoMorphTwin(rig)) {
    if (durationMs <= 0) {
      commitHoloToLayerA(rig, nextContent);
      setJewelPhotoDisplayAlpha(rig.bgMatA, 1);
      if (rig.fgMatA) {
        setJewelPhotoDisplayAlpha(rig.fgMatA, 1);
      }
      morph.active = false;
      morph.elapsedMs = 0;
      morph.singleLayer = false;
      morph.midSwapped = false;
      return;
    }
    morph.singleLayer = true;
    morph.midSwapped = false;
    morph.active = true;
    morph.elapsedMs = 0;
    morph.durationMs = durationMs;
    return;
  }

  if (durationMs <= 0) {
    commitHoloToLayerA(rig, nextContent);
    setJewelPhotoDisplayAlpha(rig.bgMatA, 1);
    disableMorphTwinLayers(rig);
    if (rig.fgMatA) {
      setJewelPhotoDisplayAlpha(rig.fgMatA, 1);
    }
    morph.active = false;
    morph.elapsedMs = 0;
    morph.singleLayer = false;
    morph.midSwapped = false;
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
  morph.singleLayer = false;
  morph.midSwapped = false;
}

/** Returns true when morph finished. */
export function tickJewelPhotoMorph(
  rig: JewelCubePhysicsRig,
  dtMs: number,
  morph: JewelPhotoMorphState,
  nextContent?: HoloContentTextures
): boolean {
  if (!morph.active) {
    return true;
  }

  if (morph.singleLayer) {
    morph.elapsedMs += dtMs;
    const t = Math.min(1, morph.elapsedMs / Math.max(morph.durationMs, 1));
    if (t <= 0.5) {
      setJewelPhotoDisplayAlpha(rig.bgMatA, 1 - t * 2);
    } else {
      if (!morph.midSwapped && nextContent) {
        commitHoloToLayerA(rig, nextContent);
        morph.midSwapped = true;
      }
      setJewelPhotoDisplayAlpha(rig.bgMatA, (t - 0.5) * 2);
    }
    if (t >= 1) {
      if (nextContent) {
        commitHoloToLayerA(rig, nextContent);
      }
      setJewelPhotoDisplayAlpha(rig.bgMatA, 1);
      morph.active = false;
      morph.elapsedMs = 0;
      morph.singleLayer = false;
      morph.midSwapped = false;
      return true;
    }
    return false;
  }

  if (!jewelRigUsesPhotoMorphTwin(rig)) {
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
