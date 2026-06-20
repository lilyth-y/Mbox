import * as THREE from "three";
import {
  applyPresentationRootTransform,
  type CubeAngularInertiaState,
  type CubeInertiaPhase,
} from "./cubeAngularInertia";
import type { FanPhaseState } from "./fanTiming";
import type { PresentationEffectId } from "./presentationEffects";
import type { PresentationFrame } from "./presentationFrame";

/** Wedding + main: deferred texture during approach only when zoom/spin is on. */
export function resolveCubeFocusTextureStep(
  effect: PresentationEffectId,
  recording: boolean,
  fanPhase: FanPhaseState | null,
  step: number,
  zoomEnabled = true
): number {
  if (
    effect !== "cube_focus" ||
    recording ||
    !fanPhase ||
    fanPhase.phase !== "approach" ||
    step === 0
  ) {
    return step;
  }
  if (!zoomEnabled) {
    return step;
  }
  // Safety: holding the previous texture for the *entire* approach makes the scene feel like it
  // "teleports" when the texture finally updates at showcase. Limit deferral to the very early
  // approach window so the new face texture arrives during the motion (not as a sudden pop).
  const u = fanPhase.phaseU ?? 0;
  const DEFER_U = 0.12; // one knob: smaller = earlier texture update
  return u < DEFER_U ? step - 1 : step;
}

export interface ApplyCubeFocusRootOptions {
  inertiaEnabled?: boolean;
  /** When false, always snap root to timeline pose (in-place / wedding parity). */
  zoomEnabled?: boolean;
  recording?: boolean;
  deltaMs?: number;
  phase?: CubeInertiaPhase;
  inertiaState?: CubeAngularInertiaState | null;
}

/** Wedding + main: same root pose application (inertia opt-in only). */
export function applyCubeFocusFrameToRoot(
  frame: PresentationFrame,
  root: THREE.Object3D,
  step: number,
  presentationCount: number,
  options: ApplyCubeFocusRootOptions = {}
): void {
  const useInertia =
    options.zoomEnabled !== false &&
    options.inertiaEnabled &&
    !options.recording &&
    frame.fanRootMotion &&
    options.inertiaState;
  if (useInertia) {
    applyPresentationRootTransform(
      frame,
      root,
      step,
      presentationCount,
      options.deltaMs ?? 16,
      options.inertiaState ?? null,
      { enabled: true, phase: options.phase }
    );
    return;
  }
  frame.applyRootTransform(root, step, presentationCount);
}
