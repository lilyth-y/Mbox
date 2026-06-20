import type { ShowcaseBackdropLightingRig } from "../babylon/showcaseBackdropLighting";
import type { JewelCrystalShellMaterial } from "../babylon/shaders/jewelCrystalShellShader";

let backdropLighting: ShowcaseBackdropLightingRig | null = null;

export function bindShowcaseBackdropLighting(rig: ShowcaseBackdropLightingRig | null): void {
  backdropLighting = rig;
}

export function tickShowcaseBackdropLighting(
  dtMs: number,
  shellMaterial?: JewelCrystalShellMaterial | null,
  innerShellMaterial?: JewelCrystalShellMaterial | null
): void {
  backdropLighting?.tick(dtMs, shellMaterial ?? null, innerShellMaterial ?? null);
}

export function disposeShowcaseBackdropLightingBinding(): void {
  backdropLighting = null;
}

/** @deprecated use bindShowcaseBackdropLighting */
export function bindShowcaseMediaBackdrop(rig: ShowcaseBackdropLightingRig | null): void {
  bindShowcaseBackdropLighting(rig);
}

/** @deprecated use tickShowcaseBackdropLighting */
export function tickShowcaseMediaBackdrop(
  dtMs: number,
  shellMaterial?: JewelCrystalShellMaterial | null
): void {
  tickShowcaseBackdropLighting(dtMs, shellMaterial);
}

/** @deprecated */
export function resizeShowcaseMediaBackdrop(): void {
  /* DOM backdrop resizes with CSS object-fit: cover */
}

/** @deprecated use disposeShowcaseBackdropLightingBinding */
export function disposeShowcaseMediaBackdropBinding(): void {
  disposeShowcaseBackdropLightingBinding();
}
