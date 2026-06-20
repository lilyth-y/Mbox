import * as THREE from "three";

export type FanAxisTumbleOptions = {
  /** Sin/cos pitch-roll shake — only when complex rotation FX is on. */
  wobble?: boolean;
};

/**
 * Pitch / roll tumble on top of timeline yaw — no extra Y spin (avoids chaotic rotation).
 */
export function fanAxisTumble(
  base: THREE.Euler,
  step: number,
  phaseElapsedMs: number,
  motionSeed: number,
  intensity = 1,
  options: FanAxisTumbleOptions = {}
): THREE.Euler {
  if (intensity <= 0.001) {
    return base.clone();
  }

  const wobble = options.wobble === true;
  const t = phaseElapsedMs * 0.001;
  const seed = motionSeed * 0.17 + step * 2.31;
  const env = THREE.MathUtils.clamp(intensity, 0, 1.2);

  const pitchRate = (0.42 + ((seed * 1.4) % 0.22)) * env;
  const rollRate = (0.36 + ((seed * 0.85) % 0.18)) * env;

  const wobblePitch = wobble
    ? Math.sin(t * (0.92 + (seed % 0.18)) + seed) * 0.22 * env
    : 0;
  const wobbleRoll = wobble
    ? Math.cos(t * (0.78 + (step % 3) * 0.06) + step) * 0.18 * env
    : 0;

  const xAngle = t * pitchRate * Math.PI * 2 * 0.5 + wobblePitch;
  const zAngle = t * rollRate * Math.PI * 2 * 0.42 + wobbleRoll;

  const baseQ = new THREE.Quaternion().setFromEuler(base);
  const qx = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), xAngle);
  const qz = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), zAngle);
  return new THREE.Euler().setFromQuaternion(baseQ.clone().multiply(qx).multiply(qz));
}

/** @deprecated Use fanAxisTumble + fanSpinEuler — kept for scripts importing fanAxisWander. */
export function fanAxisWander(
  base: THREE.Euler,
  step: number,
  phaseElapsedMs: number,
  motionSeed: number,
  intensity = 1,
  signedYawRevs = 0
): THREE.Euler {
  const baseQ = new THREE.Quaternion().setFromEuler(base);
  const qy = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0, 1, 0),
    signedYawRevs * Math.PI * 2
  );
  const withYaw = new THREE.Euler().setFromQuaternion(baseQ.clone().multiply(qy));
  return fanAxisTumble(withYaw, step, phaseElapsedMs, motionSeed, intensity);
}
