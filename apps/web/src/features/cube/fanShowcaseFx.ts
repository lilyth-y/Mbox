import {
  clampZoomIntensity,
  type CubeShowcaseFxOptions,
} from "@mbox/shared";
import { easeOutQuart, FAN_SCALE_PEAK, FAN_SCALE_RETREAT, type FanPhase } from "./fanTiming";
import {
  FAN_CAMERA_Z_CLOSE,
  FAN_FOV_CLOSE,
  type FanPerspectiveSample,
} from "./fanPerspective";
import {
  sampleApproachPresentationScale,
  sampleRetreatPresentationScale,
} from "./fanScaleCoupledSpin";

/** Slow hero pull — face-forward showcase, background stays put. */
export function showcaseSubjectPullEnvelope(phaseU: number): number {
  const u = Math.min(1, Math.max(0, phaseU));
  const rise = easeOutQuart(Math.min(1, u / 0.72));
  const fall = u > 0.82 ? easeOutQuart((1 - u) / 0.18) : 1;
  return rise * fall;
}

function zoomBlend(fx: CubeShowcaseFxOptions): number {
  if (!fx.cubeShowcaseZoomEnabled) {
    return 0;
  }
  return clampZoomIntensity(fx.cubeZoomIntensity);
}

export function applyFanZoomScale(
  animatedScale: number,
  fx: CubeShowcaseFxOptions
): number {
  const blend = zoomBlend(fx);
  if (blend <= 0) {
    return FAN_SCALE_PEAK;
  }
  return FAN_SCALE_PEAK + (animatedScale - FAN_SCALE_PEAK) * blend;
}

/**
 * Logical scale for rotation gating — always follows approach/retreat curves even when zoom FX is off
 * (applyFanZoomScale pins visual scale to PEAK when zoom is disabled).
 */
export function resolveFanMotionScale(phase: FanPhase, phaseU: number): number {
  const u = Math.min(1, Math.max(0, phaseU));
  if (phase === "approach") {
    return sampleApproachPresentationScale(u);
  }
  if (phase === "showcase_hold") {
    return FAN_SCALE_PEAK;
  }
  if (phase === "retreat") {
    return sampleRetreatPresentationScale(u);
  }
  return FAN_SCALE_RETREAT;
}

export function applyFanZoomCamera(
  sample: FanPerspectiveSample,
  fx: CubeShowcaseFxOptions
): FanPerspectiveSample {
  const blend = zoomBlend(fx);
  if (blend >= 1) {
    return sample;
  }
  if (blend <= 0) {
    return {
      cameraZ: FAN_CAMERA_Z_CLOSE,
      fieldOfView: FAN_FOV_CLOSE,
      cameraOffsetX: sample.cameraOffsetX * 0.3,
      cameraOffsetY: sample.cameraOffsetY * 0.3,
    };
  }
  return {
    cameraZ: FAN_CAMERA_Z_CLOSE + (sample.cameraZ - FAN_CAMERA_Z_CLOSE) * blend,
    fieldOfView: FAN_FOV_CLOSE + (sample.fieldOfView - FAN_FOV_CLOSE) * blend,
    cameraOffsetX: sample.cameraOffsetX * (0.3 + 0.7 * blend),
    cameraOffsetY: sample.cameraOffsetY * (0.3 + 0.7 * blend),
  };
}
