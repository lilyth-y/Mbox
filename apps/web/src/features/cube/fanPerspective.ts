import * as THREE from "three";
import { FRONT_CAMERA_Z } from "./cubeSequence";
import {
  easeInOutSine,
  easeOutQuart,
  type FanPhase,
  type FanPhaseState,
} from "./fanTiming";
import { retreatScaleEase } from "./fanTransform";
import { heartbeatPhaseBlend, sampleHeartbeat } from "./fanHeartbeat";
import { applyFanZoomCamera } from "./fanShowcaseFx";
import {
  DEFAULT_CUBE_SHOWCASE_FX,
  showcaseHeartbeatStrength,
  type CubeShowcaseFxOptions,
} from "@mbox/shared";

/** Camera sits farther when the cube is small — strong depth cue on approach. */
export const FAN_CAMERA_Z_FAR = 5.85;
/** Pull-in target — slightly closer than turntable FRONT_CAMERA_Z for hero punch. */
export const FAN_CAMERA_Z_CLOSE = FRONT_CAMERA_Z * 0.94;
export const FAN_FOV_FAR = 80;
export const FAN_FOV_CLOSE = 66;
/** Subtle lateral drift while locked on a face (world units). */
export const FAN_CAMERA_SWAY_XY = 0.048;

export interface FanPerspectiveSample {
  cameraZ: number;
  fieldOfView: number;
  cameraOffsetX: number;
  cameraOffsetY: number;
}

function lerpCamera(
  farZ: number,
  closeZ: number,
  farFov: number,
  closeFov: number,
  t: number
): Pick<FanPerspectiveSample, "cameraZ" | "fieldOfView"> {
  const u = THREE.MathUtils.clamp(t, 0, 1);
  return {
    cameraZ: THREE.MathUtils.lerp(farZ, closeZ, u),
    fieldOfView: THREE.MathUtils.lerp(farFov, closeFov, u),
  };
}

function showcaseSway(step: number, phaseElapsed: number, motionSeed: number): {
  cameraOffsetX: number;
  cameraOffsetY: number;
} {
  const t = phaseElapsed * 0.00038 + step * 0.61 + motionSeed * 0.017;
  const envelope = 0.72 + 0.28 * Math.sin(phaseElapsed * 0.0011 + step);
  return {
    cameraOffsetX: Math.sin(t) * FAN_CAMERA_SWAY_XY * envelope,
    cameraOffsetY: Math.cos(t * 0.87) * FAN_CAMERA_SWAY_XY * 0.55 * envelope,
  };
}

/** C¹ ease — zero velocity at approach start/end (smooth into showcase peak). */
export function fanApproachEase(phaseU: number): number {
  const u = THREE.MathUtils.clamp(phaseU, 0, 1);
  return u < 0.5 ? 16 * u * u * u * u * u : 1 - ((-2 * u + 2) ** 5) / 2;
}

/** Scale + camera pull-back — immediate shrink from peak (spin uses {@link retreatSpinEase}). */
export function fanRetreatEase(phaseU: number): number {
  return retreatScaleEase(phaseU);
}

export function sampleFanPerspective(
  phase: FanPhase,
  state: FanPhaseState,
  step: number,
  motionSeed: number,
  fx: CubeShowcaseFxOptions = DEFAULT_CUBE_SHOWCASE_FX
): FanPerspectiveSample {
  switch (phase) {
    case "approach": {
      const pull = fanApproachEase(state.phaseU);
      const cam = lerpCamera(
        FAN_CAMERA_Z_FAR,
        FAN_CAMERA_Z_CLOSE,
        FAN_FOV_FAR,
        FAN_FOV_CLOSE,
        pull
      );
      const rush = easeOutQuart(state.phaseU);
      return applyFanZoomCamera(
        {
          ...cam,
          cameraOffsetX: (motionSeed % 7) * 0.004 * (1 - rush),
          cameraOffsetY: -0.022 * (1 - pull),
        },
        fx
      );
    }
    case "showcase_hold": {
      const hbStrength = showcaseHeartbeatStrength(fx);
      const hbBlend = hbStrength > 0 ? heartbeatPhaseBlend(state.phaseU) : 0;
      const heartbeat =
        hbStrength > 0
          ? sampleHeartbeat(state.phaseElapsed)
          : { scale: 0, pulse: 0, envelope: 0 };
      const hb = heartbeat.scale * hbBlend * hbStrength;
      const sway = showcaseSway(step, state.phaseElapsed, motionSeed);
      const edgeMs = Math.min(420, state.phaseDuration * 0.22);
      const swayFade =
        Math.min(1, state.phaseElapsed / Math.max(edgeMs, 1)) *
        Math.min(1, (state.phaseDuration - state.phaseElapsed) / Math.max(edgeMs, 1));
      const holdPull = 1 - hb * 0.045;
      return applyFanZoomCamera(
        {
          cameraZ: FAN_CAMERA_Z_CLOSE * holdPull - hb * 0.065,
          fieldOfView: FAN_FOV_CLOSE + hb * 1.6,
          cameraOffsetX: sway.cameraOffsetX * swayFade,
          cameraOffsetY: sway.cameraOffsetY * swayFade,
        },
        fx
      );
    }
    case "retreat": {
      const push = fanRetreatEase(state.phaseU);
      const cam = lerpCamera(
        FAN_CAMERA_Z_CLOSE,
        FAN_CAMERA_Z_FAR,
        FAN_FOV_CLOSE,
        FAN_FOV_FAR,
        push
      );
      cam.fieldOfView = THREE.MathUtils.lerp(
        FAN_FOV_CLOSE,
        FAN_FOV_FAR,
        Math.pow(push, 1.45)
      );
      const sway = showcaseSway(step, state.phaseElapsed, motionSeed);
      const swayFade = 1 - push;
      return applyFanZoomCamera(
        {
          ...cam,
          cameraOffsetX: -sway.cameraOffsetX * 0.22 * push * swayFade,
          cameraOffsetY: 0.012 * push * swayFade,
        },
        fx
      );
    }
    case "handoff":
    default: {
      const hbStrength = showcaseHeartbeatStrength(fx);
      const hbBlend = hbStrength > 0 ? heartbeatPhaseBlend(state.phaseU, 0.22) : 0;
      const heartbeat =
        hbStrength > 0
          ? sampleHeartbeat(state.phaseElapsed)
          : { scale: 0, pulse: 0, envelope: 0 };
      const hb = heartbeat.scale * hbBlend * hbStrength;
      const cam = lerpCamera(
        FAN_CAMERA_Z_FAR,
        FAN_CAMERA_Z_FAR,
        FAN_FOV_FAR,
        FAN_FOV_FAR,
        1
      );
      const sway = showcaseSway(step, state.phaseElapsed, motionSeed);
      return applyFanZoomCamera(
        {
          cameraZ: cam.cameraZ - hb * 0.04,
          fieldOfView: cam.fieldOfView + hb * 0.5,
          cameraOffsetX: sway.cameraOffsetX * 0.35 * hbBlend,
          cameraOffsetY: sway.cameraOffsetY * 0.35 * hbBlend,
        },
        fx
      );
    }
  }
}

export function sampleFanLoopBridgePerspective(
  bridgeElapsed: number,
  bridgeMs: number,
  fx: CubeShowcaseFxOptions = DEFAULT_CUBE_SHOWCASE_FX
): FanPerspectiveSample {
  const alpha = easeInOutSine(Math.min(1, Math.max(0, bridgeElapsed / Math.max(bridgeMs, 1))));
  const cam = lerpCamera(
    FAN_CAMERA_Z_CLOSE,
    FAN_CAMERA_Z_FAR,
    FAN_FOV_CLOSE,
    FAN_FOV_FAR,
    alpha
  );
  return applyFanZoomCamera(
    {
      ...cam,
      cameraOffsetX: 0,
      cameraOffsetY: 0,
    },
    fx
  );
}
