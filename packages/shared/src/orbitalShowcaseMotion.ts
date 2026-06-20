/**
 * Orbital polyhedron motion: revolution + self-spin, decel at front,
 * 2s hold with ω=0, then accel to next face.
 *
 * Jerk-limited profile: quintic smootherstep keyframes + speed envelope blends
 * (orbital-easing-profile P1).
 */

export const ORBITAL_SHOWCASE_HOLD_MS = 2000;
export const ORBITAL_TRAVEL_MS = 2200;
export const ORBITAL_DECEL_MS = 820;
export const ORBITAL_ACCEL_MS = 780;
/** Overlap before decel/hold/accel boundaries — reduces ω/scale jerk. */
export const ORBITAL_JERK_BLEND_MS = 220;
/** Scales orbit/spin keyframe deltas for EHI euler spike rule @ 30fps lab gate. */
export const ORBITAL_EHI_ANGULAR_MUL = 0.28;
/** Spin travel/accel rad deltas (pre-mul). */
export const ORBITAL_SPIN_TRAVEL_DELTA = 1.1;
export const ORBITAL_SPIN_ACCEL_DELTA = 0.85;

export type OrbitalShowcasePhase = "travel" | "decel" | "hold" | "accel";

export interface OrbitalShowcasePhaseState {
  phase: OrbitalShowcasePhase;
  /** 0..1 within current phase */
  alpha: number;
  phaseElapsedMs: number;
}

export interface OrbitalShowcaseSample {
  phase: OrbitalShowcasePhase;
  orbitAngleRad: number;
  spinAngleRad: number;
  tiltAngleRad: number;
  /** Subtle roll (Z) during decel → front lock. */
  dockRollRad: number;
  /** 0 at travel, 1 at hold peak — jerk-smoothed. */
  frontness: number;
  scale: number;
  angularSpeedFactor: number;
  /** 0..1 camera dolly envelope (synced with scale/frontness). */
  cameraDolly: number;
  /** 0..1 front docking lock — peaks at decel→hold. */
  dockingLock: number;
  /** 0..1 subtle hold push — zero at hold edges. */
  holdBreath: number;
  parallaxAmount: number;
  focusPulse: number;
}

export interface OrbitalMotionKeyframe {
  t: number;
  value: number;
}

function clamp01(t: number): number {
  return Math.min(1, Math.max(0, t));
}

/** Quintic smootherstep — zero 1st/2nd derivative at 0 and 1. */
export function smootherstep(t: number): number {
  const x = clamp01(t);
  return x * x * x * (x * (x * 6 - 15) + 10);
}

/** Minimum-jerk step (10τ³ − 15τ⁴ + 6τ⁵). */
export function minimumJerkStep(t: number): number {
  const x = clamp01(t);
  return x * x * x * (10 + x * (6 * x - 15));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function interpolateOrbitalKeyframes(
  elapsedMs: number,
  keyframes: OrbitalMotionKeyframe[],
  ease: (t: number) => number = smootherstep
): number {
  if (keyframes.length === 0) {
    return 0;
  }
  if (elapsedMs <= keyframes[0].t) {
    return keyframes[0].value;
  }
  for (let i = 1; i < keyframes.length; i += 1) {
    const next = keyframes[i];
    const prev = keyframes[i - 1];
    if (elapsedMs <= next.t) {
      const span = next.t - prev.t;
      if (span <= 0) {
        return next.value;
      }
      const local = (elapsedMs - prev.t) / span;
      return lerp(prev.value, next.value, ease(local));
    }
  }
  return keyframes[keyframes.length - 1].value;
}

export function getOrbitalShowcaseSegmentMs(
  holdMs: number = ORBITAL_SHOWCASE_HOLD_MS
): number {
  return ORBITAL_TRAVEL_MS + ORBITAL_DECEL_MS + holdMs + ORBITAL_ACCEL_MS;
}

export function resolveOrbitalShowcasePhase(
  stepElapsedMs: number,
  holdMs: number = ORBITAL_SHOWCASE_HOLD_MS
): OrbitalShowcasePhaseState {
  const travelEnd = ORBITAL_TRAVEL_MS;
  const decelEnd = travelEnd + ORBITAL_DECEL_MS;
  const holdEnd = decelEnd + holdMs;
  const total = holdEnd + ORBITAL_ACCEL_MS;
  const t = Math.min(Math.max(0, stepElapsedMs), total);

  if (t < travelEnd) {
    return { phase: "travel", alpha: t / travelEnd, phaseElapsedMs: t };
  }
  if (t < decelEnd) {
    const local = t - travelEnd;
    return { phase: "decel", alpha: local / ORBITAL_DECEL_MS, phaseElapsedMs: local };
  }
  if (t < holdEnd) {
    const local = t - decelEnd;
    return { phase: "hold", alpha: local / holdMs, phaseElapsedMs: local };
  }
  const local = t - holdEnd;
  return { phase: "accel", alpha: local / ORBITAL_ACCEL_MS, phaseElapsedMs: local };
}

function sampleAngularSpeedFactor(stepElapsedMs: number, holdMs: number): number {
  const decelEnd = ORBITAL_TRAVEL_MS + ORBITAL_DECEL_MS;
  const holdEnd = decelEnd + holdMs;
  const segEnd = holdEnd + ORBITAL_ACCEL_MS;
  const blend = ORBITAL_JERK_BLEND_MS;

  const decelStart = Math.max(0, ORBITAL_TRAVEL_MS - blend * 0.5);
  const accelEnd = Math.min(segEnd, holdEnd + ORBITAL_ACCEL_MS + blend * 0.35);

  if (stepElapsedMs <= decelStart) {
    return 1;
  }
  if (stepElapsedMs < decelEnd) {
    const t = (stepElapsedMs - decelStart) / Math.max(1, decelEnd - decelStart);
    return 1 - smootherstep(t);
  }
  if (stepElapsedMs < holdEnd) {
    return 0;
  }
  if (stepElapsedMs < accelEnd) {
    const t = (stepElapsedMs - holdEnd) / Math.max(1, accelEnd - holdEnd);
    return smootherstep(t);
  }
  return 1;
}

function sampleHoldBreath(state: OrbitalShowcasePhaseState, holdMs: number): number {
  if (state.phase !== "hold" || holdMs <= 0) {
    return 0;
  }
  const edgeFadeMs = Math.min(ORBITAL_JERK_BLEND_MS, holdMs * 0.22);
  let edge = 1;
  if (state.phaseElapsedMs < edgeFadeMs) {
    edge = smootherstep(state.phaseElapsedMs / edgeFadeMs);
  } else if (state.phaseElapsedMs > holdMs - edgeFadeMs) {
    edge = smootherstep((holdMs - state.phaseElapsedMs) / edgeFadeMs);
  }
  return Math.sin(state.alpha * Math.PI) * edge;
}

export interface SampleOrbitalShowcaseOptions {
  step: number;
  faceCount: number;
  holdMs?: number;
  orbitRevsPerStep?: number;
  motionSeed?: number;
}

export function sampleOrbitalShowcaseMotion(
  stepElapsedMs: number,
  options: SampleOrbitalShowcaseOptions
): OrbitalShowcaseSample {
  const holdMs = options.holdMs ?? ORBITAL_SHOWCASE_HOLD_MS;
  const faceCount = Math.max(1, options.faceCount);
  const orbitRevs = options.orbitRevsPerStep ?? 0.85;
  const seed = options.motionSeed ?? 0;
  const angMul = ORBITAL_EHI_ANGULAR_MUL;
  const state = resolveOrbitalShowcasePhase(stepElapsedMs, holdMs);

  const travelEnd = ORBITAL_TRAVEL_MS;
  const decelEnd = travelEnd + ORBITAL_DECEL_MS;
  const holdEnd = decelEnd + holdMs;
  const segEnd = holdEnd + ORBITAL_ACCEL_MS;

  const stepAngle = ((Math.PI * 2) / faceCount) * angMul;
  const baseOrbit = options.step * stepAngle + seed * 0.17 * angMul;
  const travelSpin = options.step * 0.9 * angMul + seed * 0.11 * angMul;
  const orbitTravelDelta = orbitRevs * Math.PI * 2 * 0.55 * angMul;
  const orbitAccelDelta = orbitRevs * Math.PI * 2 * 0.35 * angMul;
  const frontOrbit = baseOrbit + stepAngle;
  const frontSpin = travelSpin + 1.35 * angMul;
  const baseTilt = 0.12 + Math.sin(seed + options.step) * 0.055;
  const dockRollSign = Math.sin(seed * 1.7 + options.step * 0.6);

  let orbitShift = 0;
  let spinShift = 0;
  let tiltShift = 0;
  if (options.step > 0) {
    const prev = sampleOrbitalShowcaseMotion(segEnd - 1, {
      ...options,
      step: options.step - 1,
    });
    orbitShift = prev.orbitAngleRad - baseOrbit;
    spinShift = prev.spinAngleRad - travelSpin;
    tiltShift = prev.tiltAngleRad - baseTilt;
  }

  const orbitAngleRad = interpolateOrbitalKeyframes(stepElapsedMs, [
    { t: 0, value: baseOrbit + orbitShift },
    { t: travelEnd, value: baseOrbit + orbitTravelDelta + orbitShift },
    { t: decelEnd, value: frontOrbit + orbitShift },
    { t: holdEnd, value: frontOrbit + orbitShift },
    { t: segEnd, value: frontOrbit + orbitAccelDelta + orbitShift },
  ]);

  const spinAngleRad = interpolateOrbitalKeyframes(stepElapsedMs, [
    { t: 0, value: travelSpin + spinShift },
    { t: travelEnd, value: travelSpin + ORBITAL_SPIN_TRAVEL_DELTA * angMul + spinShift },
    { t: decelEnd, value: frontSpin + spinShift },
    { t: holdEnd, value: frontSpin + spinShift },
    { t: segEnd, value: frontSpin + ORBITAL_SPIN_ACCEL_DELTA * angMul + spinShift },
  ]);

  const scale = interpolateOrbitalKeyframes(stepElapsedMs, [
    { t: 0, value: 0.88 },
    { t: travelEnd, value: 0.95 },
    { t: travelEnd + ORBITAL_DECEL_MS * 0.72, value: 1.04 },
    { t: decelEnd, value: 1.12 },
    { t: holdEnd, value: 1.1 },
    { t: holdEnd + ORBITAL_ACCEL_MS * 0.42, value: 1.02 },
    { t: segEnd, value: 0.94 },
  ]);

  const dockingLock = interpolateOrbitalKeyframes(
    stepElapsedMs,
    [
      { t: 0, value: 0 },
      { t: travelEnd, value: 0.06 },
      { t: travelEnd + ORBITAL_DECEL_MS * 0.5, value: 0.58 },
      { t: decelEnd, value: 1 },
      { t: holdEnd, value: 1 },
      { t: holdEnd + ORBITAL_ACCEL_MS * 0.45, value: 0.12 },
      { t: segEnd, value: 0 },
    ],
    minimumJerkStep
  );

  const cameraDolly = interpolateOrbitalKeyframes(stepElapsedMs, [
    { t: 0, value: 0 },
    { t: travelEnd, value: 0.14 },
    { t: travelEnd + ORBITAL_DECEL_MS * 0.6, value: 0.78 },
    { t: decelEnd, value: 1 },
    { t: holdEnd, value: 1 },
    { t: holdEnd + ORBITAL_ACCEL_MS * 0.35, value: 0.72 },
    { t: segEnd, value: 0.5 },
  ]);

  const tiltAngleRad = interpolateOrbitalKeyframes(stepElapsedMs, [
    { t: 0, value: baseTilt + tiltShift },
    { t: travelEnd, value: baseTilt + 0.04 + tiltShift },
    { t: travelEnd + ORBITAL_DECEL_MS * 0.7, value: baseTilt + 0.14 + tiltShift },
    { t: decelEnd, value: baseTilt + 0.18 + tiltShift },
    { t: holdEnd, value: baseTilt + 0.14 + tiltShift },
    { t: segEnd, value: baseTilt + 0.03 + tiltShift },
  ]);

  const dockRollRad = interpolateOrbitalKeyframes(stepElapsedMs, [
    { t: travelEnd, value: 0 },
    { t: decelEnd, value: 0.04 * dockRollSign },
    { t: holdEnd, value: 0.015 * dockRollSign },
    { t: segEnd, value: 0 },
  ]);

  const frontness = cameraDolly;
  const holdBreath = sampleHoldBreath(state, holdMs);
  const angularSpeedFactor = sampleAngularSpeedFactor(stepElapsedMs, holdMs);

  const parallaxAmount =
    state.phase === "hold"
      ? 0.18 + holdBreath * 0.14
      : frontness * 0.08 + dockingLock * 0.08;
  const focusPulse =
    state.phase === "hold"
      ? holdBreath * 0.62
      : frontness * 0.32 + dockingLock * 0.18;

  return {
    phase: state.phase,
    orbitAngleRad,
    spinAngleRad,
    tiltAngleRad,
    dockRollRad,
    frontness,
    scale,
    angularSpeedFactor,
    cameraDolly,
    dockingLock,
    holdBreath,
    parallaxAmount,
    focusPulse,
  };
}

export function isOrbitalShowcaseFrozen(sample: OrbitalShowcaseSample): boolean {
  return sample.angularSpeedFactor === 0 && sample.phase === "hold";
}

/** Max per-ms change of angularSpeedFactor between adjacent samples (jerk QA). */
export function measureOrbitalAngularSpeedJerkPeak(
  options: SampleOrbitalShowcaseOptions,
  holdMs: number = ORBITAL_SHOWCASE_HOLD_MS,
  dtMs: number = 16
): number {
  const total = getOrbitalShowcaseSegmentMs(holdMs);
  let peak = 0;
  let prev = sampleOrbitalShowcaseMotion(0, options).angularSpeedFactor;
  for (let t = dtMs; t <= total; t += dtMs) {
    const next = sampleOrbitalShowcaseMotion(t, options).angularSpeedFactor;
    peak = Math.max(peak, Math.abs(next - prev) / dtMs);
    prev = next;
  }
  return peak;
}

/** Max per-ms change of scale between adjacent samples. */
export function measureOrbitalScaleJerkPeak(
  options: SampleOrbitalShowcaseOptions,
  holdMs: number = ORBITAL_SHOWCASE_HOLD_MS,
  dtMs: number = 16
): number {
  const total = getOrbitalShowcaseSegmentMs(holdMs);
  let peak = 0;
  let prev = sampleOrbitalShowcaseMotion(0, options).scale;
  for (let t = dtMs; t <= total; t += dtMs) {
    const next = sampleOrbitalShowcaseMotion(t, options).scale;
    peak = Math.max(peak, Math.abs(next - prev) / dtMs);
    prev = next;
  }
  return peak;
}
