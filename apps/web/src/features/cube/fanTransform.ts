import * as THREE from "three";
import { CubeRotationMode } from "./cubeTransitionRotation";

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

export function fanSpinEuler(
  seed: number,
  step: number,
  base: THREE.Euler,
  intensity: number,
  elapsedMs: number,
  yawSign: number = 1
): THREE.Euler {
  if (intensity <= 0.001) {
    return base.clone();
  }
  const rnd = mulberry32(seed ^ step * 9973);
  const yawDir = yawSign >= 0 ? 1 : -1;
  const seconds = elapsedMs / 1000;
  const spinEnvelope = 1 - Math.exp(-seconds * 0.85);
  const yawRate = (0.3 + rnd() * 0.42) * intensity * yawDir;
  const pitchRate = (0.04 + rnd() * 0.1) * intensity * (rnd() > 0.5 ? 1 : -1);
  const rollRate = (0.025 + rnd() * 0.07) * intensity * (rnd() > 0.5 ? 1 : -1);
  const euler = base.clone();
  euler.y += yawRate * seconds * spinEnvelope;
  euler.x += pitchRate * seconds * 0.32 * spinEnvelope;
  euler.z += rollRate * seconds * 0.22 * spinEnvelope;
  return euler;
}
