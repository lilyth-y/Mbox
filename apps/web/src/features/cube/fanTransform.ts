import * as THREE from "three";
import { CubeRotationMode } from "./cubeTransitionRotation";
import {
  FanTimelineProfile,
  getFanApproachMs,
  getFanShowcaseHoldMs,
  getFanRetreatMs
} from "./fanTiming";

export const ENTRANCE_APPROACH_SPIN_MAX = 0.45;
export const ENTRANCE_SHOWCASE_SPIN = 0.055;
export const FAN_MIN_TRANSITION_SPIN_INTENSITY = 0.016;

export function resolveSpinYawSign(mode: CubeRotationMode): number {
  if (mode === "yaw_ccw") {
    return -1;
  }
  return 1;
}

export function mulberry32(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function getAccumulatedRevs(
  stepElapsedMs: number,
  step: number,
  profile: FanTimelineProfile = "wedding_default"
): number {
  const T_app = getFanApproachMs(step, profile) / 1000;
  const T_show = getFanShowcaseHoldMs(step, profile) / 1000;
  const T_ret = getFanRetreatMs(profile) / 1000;
  
  let revs = 0;
  let t = stepElapsedMs / 1000;
  
  if (t <= T_app) {
    return 3 * t + 2 * T_app / Math.PI * Math.sin(Math.PI * t / T_app);
  }
  revs += 3 * T_app;
  t -= T_app;
  
  if (t <= T_show) {
    return revs; // completely stopped
  }
  t -= T_show;
  
  if (t <= T_ret) {
    return revs + 3 * t - 2 * T_ret / Math.PI * Math.sin(Math.PI * t / T_ret);
  }
  revs += 3 * T_ret;
  t -= T_ret;
  
  return revs + 5.0 * t;
}

export function fanSpinEuler(
  seed: number,
  step: number,
  base: THREE.Euler,
  accumulatedRevs: number,
  yawSign: number = 1
): THREE.Euler {
  const rnd = mulberry32(seed ^ step * 9973);
  const yawDir = yawSign >= 0 ? 1 : -1;
  
  const yawAngle = accumulatedRevs * 2 * Math.PI * yawDir;
  const pitchAngle = 0.05 * accumulatedRevs * 2 * Math.PI * (rnd() > 0.5 ? 1 : -1);
  const rollAngle = 0.05 * accumulatedRevs * 2 * Math.PI * (rnd() > 0.5 ? 1 : -1);
  
  const euler = base.clone();
  euler.y += yawAngle;
  euler.x += pitchAngle * 0.32;
  euler.z += rollAngle * 0.22;
  return euler;
}
