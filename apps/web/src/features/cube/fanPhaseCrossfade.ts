import * as THREE from "three";
import { slerpEuler } from "./cubeSequence";
import { easeInOutSine, FAN_SHOWCASE_RETREAT_CROSSFADE_MS } from "./fanTiming";
import type { FanCubeSample } from "./fanPhases";

/** Blend window at phase seams (approach↔showcase↔retreat). */
export const FAN_PHASE_CROSSFADE_MS = 680;
export { FAN_SHOWCASE_RETREAT_CROSSFADE_MS };

export function getPhaseCrossfadeMs(speedMul: number = 1): number {
  const mul = Math.max(0.35, Math.min(2.5, speedMul));
  return FAN_PHASE_CROSSFADE_MS / mul;
}

export function getShowcaseRetreatCrossfadeMs(speedMul: number = 1): number {
  const mul = Math.max(0.35, Math.min(2.5, speedMul));
  return FAN_SHOWCASE_RETREAT_CROSSFADE_MS / mul;
}

export function phaseCrossfadeT(elapsedInWindow: number, windowMs: number): number {
  const t = Math.min(1, Math.max(0, elapsedInWindow / Math.max(windowMs, 1)));
  return t * t * (3 - 2 * t);
}

/** Step seam — linear rotation blend preserves handoff exit ω (easeInOut has dT/dt=0 at entry). */
export function stepSeamCrossfadeT(elapsedInWindow: number, windowMs: number): number {
  return Math.min(1, Math.max(0, elapsedInWindow / Math.max(windowMs, 1)));
}

export type FanSampleBlendMode = "full" | "pose_from_to" | "scale_first";

export function blendFanCubeSamples(
  from: FanCubeSample,
  to: FanCubeSample,
  t: number,
  mode: FanSampleBlendMode = "full"
): FanCubeSample {
  const u = THREE.MathUtils.clamp(t, 0, 1);
  let rotation: THREE.Euler;
  if (mode === "pose_from_to") {
    rotation = to.rotation.clone();
  } else if (mode === "scale_first") {
    const rotDelay = 0.36;
    const rotT =
      u <= rotDelay ? 0 : easeInOutSine((u - rotDelay) / Math.max(1 - rotDelay, 1e-6));
    rotation = rotT <= 0 ? from.rotation.clone() : slerpEuler(from.rotation, to.rotation, rotT);
  } else {
    rotation = slerpEuler(from.rotation, to.rotation, u);
  }
  return {
    presentationScale: THREE.MathUtils.lerp(from.presentationScale, to.presentationScale, u),
    rotation,
    parallaxAmount: THREE.MathUtils.lerp(from.parallaxAmount, to.parallaxAmount, u),
    focusPulse: THREE.MathUtils.lerp(from.focusPulse ?? 0, to.focusPulse ?? 0, u),
    cameraZ: THREE.MathUtils.lerp(from.cameraZ, to.cameraZ, u),
    fieldOfView: THREE.MathUtils.lerp(from.fieldOfView, to.fieldOfView, u),
    cameraOffsetX: THREE.MathUtils.lerp(from.cameraOffsetX ?? 0, to.cameraOffsetX ?? 0, u),
    cameraOffsetY: THREE.MathUtils.lerp(from.cameraOffsetY ?? 0, to.cameraOffsetY ?? 0, u),
  };
}
