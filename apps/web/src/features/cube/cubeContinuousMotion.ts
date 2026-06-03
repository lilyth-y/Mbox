import * as THREE from "three";
import type { StepPhaseTiming } from "./cubeMotionVariety";
import { PARALLAX_MAX } from "./cubeSequence";
import { focusDollyEnvelope, focusParallaxEnvelope } from "./perceptualMotion";
import { easeInOut } from "./presentationFrame";
import {
  getCubeEntryRotation,
  getCubeExitRotation,
  slerpCubeTransition,
  type CubeRotationMode,
} from "./cubeTransitionRotation";
import { getFaceRotation } from "./cubeSequence";

export type CubeMotionMode = "travel" | "showcase";

export type CubeTravelLeg = "in" | "out";

export interface CubeMotionSample {
  mode: CubeMotionMode;
  leg?: CubeTravelLeg;
  alpha: number;
  /** 0 = far, 1 = close — single envelope for the whole focus window. */
  focusDolly: number;
  parallaxAmount: number;
}

/** Travel = cube spins at far camera; showcase = one smooth focus (dolly + parallax). */
export function sampleCubeContinuousMotion(
  step: number,
  stepElapsed: number,
  timing: StepPhaseTiming,
  _currentFace: number,
  presentationCount: number
): CubeMotionSample {
  const travelInEnd = timing.rotateMs;
  const focusEnd = travelInEnd + timing.zoomMs + timing.parallaxMs;
  const travelOutMs =
    timing.travelOutMs ?? (step + 1 < presentationCount ? 1_200 : 0);
  const travelOutEnd = focusEnd + travelOutMs;

  if (stepElapsed < travelInEnd) {
    return {
      mode: "travel",
      leg: "in",
      alpha: easeInOut(stepElapsed / Math.max(travelInEnd, 1)),
      focusDolly: 0,
      parallaxAmount: 0,
    };
  }

  if (stepElapsed < focusEnd) {
    const focusU = (stepElapsed - travelInEnd) / Math.max(focusEnd - travelInEnd, 1);
    const focusDolly = focusDollyEnvelope(focusU);
    return {
      mode: "showcase",
      alpha: focusU,
      focusDolly,
      parallaxAmount: PARALLAX_MAX * focusParallaxEnvelope(focusU),
    };
  }

  if (travelOutMs > 0 && stepElapsed < travelOutEnd) {
    return {
      mode: "travel",
      leg: "out",
      alpha: easeInOut((stepElapsed - focusEnd) / Math.max(travelOutMs, 1)),
      focusDolly: 0,
      parallaxAmount: 0,
    };
  }

  return {
    mode: "travel",
    leg: "out",
    alpha: 1,
    focusDolly: 0,
    parallaxAmount: 0,
  };
}

export function resolveCubeRotation(
  step: number,
  sample: CubeMotionSample,
  currentFace: number,
  presentationCount: number,
  rotationMode: CubeRotationMode = "auto"
): THREE.Euler {
  const faceRotation = getFaceRotation(currentFace);

  if (sample.mode === "showcase") {
    return faceRotation;
  }

  if (sample.leg === "out") {
    return slerpCubeTransition(
      faceRotation,
      getCubeExitRotation(step, presentationCount),
      sample.alpha,
      step + 1,
      rotationMode
    );
  }

  return slerpCubeTransition(
    getCubeEntryRotation(step),
    faceRotation,
    sample.alpha,
    step,
    rotationMode
  );
}
