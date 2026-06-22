import * as THREE from "three";
import type { CubeShowcaseFxOptions } from "@mbox/shared";
import { usesBaseInPlaceFanMotion } from "@mbox/shared";
import { CubeRotationMode } from "./cubeTransitionRotation";
import { slerpEuler } from "./cubeSequence";
import {
  FAN_GAP_MS,
  FAN_SCALE_FAR,
  FAN_SCALE_PEAK,
  easeInQuart,
  type FanTimelineProfile,
  getFanApproachMs,
  getFanRetreatMs,
  getFanShowcaseHoldMs,
} from "./fanTiming";
import {
  FAN_WHOOSH_APPROACH_REVS,
  FAN_WHOOSH_HANDOFF_SPIN_REVS,
  FAN_WHOOSH_RETREAT_REVS,
  integratePresentationSpinProgress,
  sampleApproachPresentationScale,
  sampleRetreatPresentationScale,
  shouldScaleCoupleSpin,
} from "./fanScaleCoupledSpin";
import { fanSmootherstep01 } from "./fanEase";

export const ENTRANCE_APPROACH_SPIN_MAX = 0.45;
/** Linear yaw revolutions during entrance step-0 showcase (~3°/s @ 3.5s hold). */
export const ENTRANCE_SHOWCASE_SPIN = 0.03;
/** Linear retreat+handoff; delayed spin keeps peak < 120°/s EHI cap. */
export const ENTRANCE_RETREAT_HANDOFF_REVS = 0.85;
/** First 40% of retreat+handoff: scale leads, yaw frozen (aesthetic scale-first exit). */
export const ENTRANCE_RETREAT_SPIN_DELAY_U = 0.4;
export const FAN_MIN_TRANSITION_SPIN_INTENSITY = 0.016;

/** Node research scripts only — safe no-op in the browser bundle. */
function readResearchEnv(name: string): string | undefined {
  if (typeof process === "undefined") {
    return undefined;
  }
  return process.env[name];
}

/** Research sweeps only (`scripts/research-rotation-comfort-boundary.mjs`). */
export function resolveEntranceShowcaseSpin(): number {
  const raw = readResearchEnv("RESEARCH_ENTRANCE_SHOWCASE_SPIN");
  if (raw != null && raw !== "") {
    return Number(raw);
  }
  return ENTRANCE_SHOWCASE_SPIN;
}

export function resolveEntranceRetreatHandoffRevs(): number {
  const raw = readResearchEnv("RESEARCH_ENTRANCE_RETREAT_HANDOFF_REVS");
  if (raw != null && raw !== "") {
    return Number(raw);
  }
  return ENTRANCE_RETREAT_HANDOFF_REVS;
}

/** 0..1 spin progress within retreat+handoff (scale-first delay). */
export function entranceRetreatHandoffSpinU(u: number): number {
  const x = Math.min(1, Math.max(0, u));
  if (x <= ENTRANCE_RETREAT_SPIN_DELAY_U) {
    return 0;
  }
  return (x - ENTRANCE_RETREAT_SPIN_DELAY_U) / (1 - ENTRANCE_RETREAT_SPIN_DELAY_U);
}

/** Yaw revolutions while approaching (decelerating spin). */
/** Integer revs — approach end matches face-forward (no showcase correction spin). */
export const FAN_APPROACH_REVS = 2;
/** Extra retreat+handoff revs when mixed/auto unwinds opposing approach spin. */
export const FAN_MIXED_RETREAT_UNWIND_EXTRA = 0.11;
/** Yaw revolutions while shrinking away from showcase. */
export const FAN_RETREAT_REVS = 0.32;
/** Extra spin during in-place retreat when complex rotation FX is on. */
export const FAN_WEDDING_CLASSIC_RETREAT_REVS = 1.6;
/** Extra spin through handoff gap when complex rotation FX is on. */
export const FAN_WEDDING_CLASSIC_HANDOFF_REVS = 0.4;
/** Extra yaw through handoff gap — keeps spin alive while cube is small at the back. */
export const FAN_HANDOFF_SPIN_REVS = 0.38;
/** @deprecated Use {@link FAN_HANDOFF_SPIN_REVS}. */
export const FAN_HANDOFF_REVS = FAN_HANDOFF_SPIN_REVS;

/** World-Y revs during approach — 0 when rotation is path-only (default in-place). */
export function resolveApproachRevsForFx(
  fx?: CubeShowcaseFxOptions,
  whooshSpin = false
): number {
  if (whooshSpin) {
    return FAN_WHOOSH_APPROACH_REVS;
  }
  if (fx && !fx.cubeShowcaseZoomEnabled) {
    return FAN_APPROACH_REVS;
  }
  return FAN_APPROACH_REVS;
}

/** World-Y revs during retreat — 0 when path-only; classic stack when complex FX on. */
export function resolveRetreatRevsForFx(
  fx?: CubeShowcaseFxOptions,
  whooshSpin = false
): number {
  if (whooshSpin) {
    return FAN_WHOOSH_RETREAT_REVS;
  }
  if (fx && !fx.cubeShowcaseZoomEnabled) {
    return FAN_WEDDING_CLASSIC_RETREAT_REVS;
  }
  return FAN_RETREAT_REVS;
}

/** Handoff gap yaw — 0 when path-only. */
export function resolveHandoffRevsForFx(
  fx?: CubeShowcaseFxOptions,
  whooshSpin = false
): number {
  if (whooshSpin) {
    return FAN_WHOOSH_HANDOFF_SPIN_REVS;
  }
  if (fx && !fx.cubeShowcaseZoomEnabled) {
    return FAN_WEDDING_CLASSIC_HANDOFF_REVS;
  }
  return FAN_HANDOFF_SPIN_REVS;
}

/** Approach spin soft-start length (phase u) for C¹ ω at step entry. */
export const FAN_APPROACH_SPIN_SOFT_START_U = 0.1;

/** Scale + camera: starts shrinking immediately at peak (ease-out, no plateau). */
export function retreatScaleEase(phaseU: number): number {
  const u = Math.min(1, Math.max(0, phaseU));
  return 1 - Math.pow(1 - u, 2.35);
}

/** Hero peak band — rotation freeze only at exact peak (showcase + retreat onset). */
export const PEAK_SCALE_HOLD_BAND = 0.045;

/**
 * Last fraction of FAR→PEAK scale range where ω must reach 0 at exact peak.
 * Kept narrow — hero landing feel is driven by {@link approachHeroLandingBlend} (phase time).
 */
export const PEAK_APPROACH_SETTLE_SPAN = 0.14;

/** Yaw gate soft-knee near peak scale. */
const APPROACH_YAW_GATE_POWER = 2.1;

/** Phase-u where leisurely face-forward landing begins (last ~36% of approach). */
const APPROACH_HERO_LANDING_START_U = 0.64;

/** 1 at {@link FAN_SCALE_PEAK}, 0 when scale has left the hero band. */
export function peakScaleHoldBlend(scale: number): number {
  const peak = FAN_SCALE_PEAK;
  const band = Math.max(0.008, (peak - FAN_SCALE_FAR) * PEAK_SCALE_HOLD_BAND);
  const d = Math.abs(scale - peak);
  if (d >= band) {
    return 0;
  }
  const t = 1 - d / band;
  return t * t * (3 - 2 * t);
}

/**
 * 0 below settle zone → 1 at peak. Quint ease-out — slow, roomy finish into face-forward.
 */
export function heroApproachSettleBlend(scale: number): number {
  const peak = FAN_SCALE_PEAK;
  const span = FAN_SCALE_PEAK - FAN_SCALE_FAR;
  const settleStart = peak - span * PEAK_APPROACH_SETTLE_SPAN;
  if (scale <= settleStart) {
    return 0;
  }
  const t = Math.min(1, Math.max(0, (scale - settleStart) / Math.max(peak - settleStart, 1e-6)));
  return t * t * (3 - 2 * t);
}

/** Yaw/tumble gate during approach — ω→0 only as motion scale reaches peak. */
export function approachYawMotionGate(scale: number, phaseU?: number): number {
  const settle = heroApproachSettleBlend(scale);
  let gate = Math.pow(Math.max(0, 1 - settle), APPROACH_YAW_GATE_POWER);
  if (phaseU !== undefined) {
    const u = Math.min(1, Math.max(0, phaseU));
    const taperStart = 0.66;
    if (u > taperStart) {
      const t = (u - taperStart) / Math.max(1 - taperStart, 1e-6);
      gate *= 1 - t * t * t * t;
    }
  }
  return gate;
}

/**
 * Phase-time hero landing — spreads face correction across the last third of approach.
 * Decoupled from scale so ease-out zoom doesn't trigger an early snap at u≈0.5.
 */
export function approachHeroLandingBlend(phaseU: number): number {
  const u = Math.min(1, Math.max(0, phaseU));
  if (u <= APPROACH_HERO_LANDING_START_U) {
    return 0;
  }
  const t = (u - APPROACH_HERO_LANDING_START_U) / Math.max(1 - APPROACH_HERO_LANDING_START_U, 1e-6);
  return t * t * t;
}

/**
 * Face-forward slerp weight — phase-time landing, gated by proximity to peak scale.
 */
export function approachFaceSettleBlend(scale: number, phaseU: number): number {
  const landing = approachHeroLandingBlend(phaseU);
  if (landing <= 0) {
    return 0;
  }
  const scaleReady = heroApproachSettleBlend(scale);
  const proximity = Math.min(1, scaleReady / 0.25);
  return landing * (0.06 + 0.94 * proximity);
}

/** Ease spun pose to face-forward during approach only (never retreat/handoff). */
export function blendRotationTowardFaceAtPeak(
  spun: THREE.Euler,
  faceForward: THREE.Euler,
  motionScale: number,
  phaseU: number,
  phase: "approach" | "showcase_hold" | "retreat" | "handoff"
): THREE.Euler {
  if (phase !== "approach") {
    return spun;
  }
  const blend = approachFaceSettleBlend(motionScale, phaseU);
  if (blend <= 0) {
    return spun;
  }
  return slerpEuler(spun, faceForward, blend);
}

/** C¹ unlock as scale leaves hero peak on retreat (ω→0 only at exact peak). */
export function retreatRotationMotionGate(scale: number): number {
  const peak = FAN_SCALE_PEAK;
  if (scale >= peak - 1e-6) {
    return 0;
  }
  const span = peak - FAN_SCALE_FAR;
  const unlockSpan = span * 0.14;
  const drop = peak - scale;
  if (drop >= unlockSpan) {
    return 1;
  }
  const t = drop / Math.max(unlockSpan, 1e-6);
  return t * t * (3 - 2 * t);
}

/** 1 while scale is not at peak — spin/tumble must stay alive off-peak. */
export function rotationMotionGate(
  scale: number,
  phase?: "approach" | "showcase_hold" | "retreat" | "handoff",
  phaseU?: number
): number {
  if (phase === "showcase_hold") {
    return 0;
  }
  if (phase === "approach") {
    return approachYawMotionGate(scale, phaseU);
  }
  if (phase === "retreat") {
    return retreatRotationMotionGate(scale);
  }
  if (phase === "handoff") {
    return 1;
  }
  return 1 - peakScaleHoldBlend(scale);
}

/** Phase-u where yaw spin hands off to styled path curve (single perceived rotation). */
const APPROACH_SPIN_TO_PATH_START_U = 0.15;
const APPROACH_SPIN_TO_PATH_END_U = 0.58;

/** 0 = world-Y spin only, 1 = path curve only (no stacked yaw×path). */
export function approachSpinToPathHandoffBlend(phaseU: number): number {
  return fanSmootherstep01(
    (Math.min(1, Math.max(0, phaseU)) - APPROACH_SPIN_TO_PATH_START_U) /
      Math.max(APPROACH_SPIN_TO_PATH_END_U - APPROACH_SPIN_TO_PATH_START_U, 1e-6)
  );
}

/**
 * C¹ ease-out — ω high early, long decel tail into showcase (hero landing).
 */
function spinEaseOutC1(phaseU: number): number {
  const u = Math.min(1, Math.max(0, phaseU));
  const v = 1 - u;
  return 1 - v * v * v * v * v;
}

/**
 * Approach yaw — 전진하며 점점 느리게 (ω↓), C¹ at step entry + showcase peak.
 */
export function approachSpinEase(phaseU: number, _fromHandoff = false): number {
  const u = Math.min(1, Math.max(0, phaseU));
  const softStart = fanSmootherstep01(Math.min(1, u / Math.max(FAN_APPROACH_SPIN_SOFT_START_U, 1e-6)));
  return spinEaseOutC1(u) * softStart;
}

/**
 * Retreat yaw body — ease-in with non-zero ω at segment end (no dead stop before handoff).
 * f(u) = u²(2−u), f′(0)=0, f′(1)=1.
 */
export function retreatSpinEase(phaseU: number): number {
  const u = Math.min(1, Math.max(0, phaseU));
  return u * u * (2 - u);
}

export function handoffGapSubProgressWhoosh(w: number, K_left: number): number {
  const x = Math.min(1, Math.max(0, w));
  const k = Math.min(2.8, Math.max(0.2, K_left));
  const a = k - 2;
  const b = 3 - 2 * k;
  const c = k;
  return a * x * x * x + b * x * x + c * x;
}

/**
 * Retreat + handoff gap as one back-flight spin arc (ω stays > 0 through the gap).
 */
export function retreatGapSpinProgress(phaseU: number, retreatWeight: number): number {
  const u = Math.min(1, Math.max(0, phaseU));
  const rw = Math.min(0.9, Math.max(0.58, retreatWeight));
  if (u <= rw) {
    const t = u / Math.max(rw, 1e-6);
    return rw * t * t * t;
  }
  const t = (u - rw) / Math.max(1 - rw, 1e-6);
  return rw + (1 - rw) * handoffGapSubProgress(t);
}

/** Whoosh back-flight: scale-weighted retreat + handoff with strong late decel (arrive calm). */
export function retreatGapWhooshSpinProgress(
  phaseU: number,
  retreatWeight: number
): number {
  const u = Math.min(1, Math.max(0, phaseU));
  const rw = Math.min(0.9, Math.max(0.58, retreatWeight));
  if (u <= rw) {
    const v = u / rw;
    return (
      rw *
      integratePresentationSpinProgress(sampleRetreatPresentationScale, "retreat", v)
    );
  }
  const w = (u - rw) / (1 - rw);
  const eps = 1e-3;
  const val1 = integratePresentationSpinProgress(sampleRetreatPresentationScale, "retreat", 1);
  const val0 = integratePresentationSpinProgress(sampleRetreatPresentationScale, "retreat", 1 - eps);
  const K_left = (val1 - val0) / eps;
  return rw + (1 - rw) * handoffGapSubProgressWhoosh(w, K_left);
}

/**
 * Progress through the handoff *sub-gap* (after the retreat portion of the back-flight).
 * Single source for handoff spin shape across in-place and whoosh, preview and export.
 * Designed so the cube keeps some lively rotation while transiting, but naturally slows
 * to near-zero ω as it settles at the far position. This makes the handoff→next-approach
 * handoff feel continuous and calm (no "whirl then brake").
 * f(0)=0, f(1)=1, f'(1)≈0 (low instantaneous ω at arrival).
 */
export function handoffGapSubProgress(w: number): number {
  const x = Math.min(1, Math.max(0, w));
  // 1 - (1-x)^3 : cubic "ease out to rest".
  // Good initial speed after retreat, then strong decel; by ~x=0.8 we have delivered
  // nearly all the handoff sub-revs, so late-hand ω is very low.
  return 1 - Math.pow(1 - x, 3);
}

/** Face→exit tracks shrink — orient freeze only while scale is still at peak. */
export function retreatOrientEase(phaseU: number): number {
  const u = Math.min(1, Math.max(0, phaseU));
  return easeInQuart(retreatScaleEase(u));
}

/** @deprecated Showcase hold is a rotation freeze; kept for config readers. */
export const FAN_SHOWCASE_SPIN_RATE = 0;

/** Yaw direction while approaching a face. */
export function resolveApproachSpinSign(mode: CubeRotationMode, step: number = 0): number {
  if (mode === "yaw_ccw") {
    return -1;
  }
  if (mode === "yaw_cw") {
    return 1;
  }
  // mixed/auto: alternate yaw direction each step to avoid monotonic drift.
  return step % 2 === 0 ? 1 : -1;
}

/** Yaw direction while retreating — opposes approach in mixed/auto (unwind). */
export function resolveRetreatSpinSign(mode: CubeRotationMode, step: number = 0): number {
  if (mode === "yaw_ccw" || mode === "yaw_cw") {
    return resolveApproachSpinSign(mode, step);
  }
  return -resolveApproachSpinSign(mode, step);
}

/** @deprecated Use resolveApproachSpinSign — kept for call sites that only need approach yaw. */
export function resolveSpinYawSign(mode: CubeRotationMode, step: number = 0): number {
  return resolveApproachSpinSign(mode, step);
}

export function usesEntranceYawSpin(
  profile: FanTimelineProfile,
  rotationMode: CubeRotationMode = "mixed"
): boolean {
  if (readResearchEnv("RESEARCH_FORCE_WEDDING_REVS") === "1") {
    return false;
  }
  return (
    profile === "entrance_processional" &&
    (rotationMode === "yaw_cw" || rotationMode === "yaw_ccw")
  );
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

/** No yaw during max-scale hold (2s showcase). */
export function getShowcaseSpinRevs(
  _step: number,
  _profile: FanTimelineProfile = "wedding_default",
  _speedMul: number = 1
): number {
  return 0;
}

export function getStepSpinRevsTotal(
  step: number,
  profile: FanTimelineProfile = "wedding_default",
  speedMul: number = 1,
  rotationMode: CubeRotationMode = "mixed",
  fx?: CubeShowcaseFxOptions
): number {
  void speedMul;
  const whooshSpin = shouldScaleCoupleSpin(fx);
  const approachRevs = resolveApproachRevsForFx(fx, whooshSpin);
  const retreatRevs = resolveRetreatRevsForFx(fx, whooshSpin);
  const handoffRevs = resolveHandoffRevsForFx(fx, whooshSpin);
  if (usesEntranceYawSpin(profile, rotationMode)) {
    const showcaseSpin = resolveEntranceShowcaseSpin();
    const retreatHandoffRevs = resolveEntranceRetreatHandoffRevs();
    return step === 0
      ? showcaseSpin + retreatHandoffRevs
      : retreatHandoffRevs;
  }
  const approachSign = resolveApproachSpinSign(rotationMode, step);
  const retreatSign = resolveRetreatSpinSign(rotationMode, step);
  const mixedUnwind =
    (rotationMode === "mixed" || rotationMode === "auto") && retreatSign !== approachSign
      ? FAN_MIXED_RETREAT_UNWIND_EXTRA
      : 0;
  return (
    approachSign * approachRevs + retreatSign * (retreatRevs + handoffRevs + mixedUnwind)
  );
}

/** Revolutions completed inside the current step up to `stepElapsedMs`. */
export function getRevsWithinStep(
  stepElapsedMs: number,
  step: number,
  speedMul: number = 1,
  profile: FanTimelineProfile = "wedding_default",
  rotationMode: CubeRotationMode = "mixed",
  fx?: CubeShowcaseFxOptions
): number {
  const mul = Math.max(0.35, Math.min(2.5, speedMul));
  let t = stepElapsedMs * mul;

  const approachMs = getFanApproachMs(step, profile);
  if (usesEntranceYawSpin(profile, rotationMode)) {
    const showcaseSpin = resolveEntranceShowcaseSpin();
    const retreatHandoffRevs = resolveEntranceRetreatHandoffRevs();
    if (t < approachMs) {
      return 0;
    }
    t -= approachMs;

    const showcaseMs = getFanShowcaseHoldMs(step, profile);
    if (t < showcaseMs) {
      if (step === 0) {
        return showcaseSpin * (t / Math.max(showcaseMs, 1));
      }
      return 0;
    }
    t -= showcaseMs;

    const retreatHandoffMs = getFanRetreatMs(profile) + FAN_GAP_MS;
    const u = Math.min(1, Math.max(0, t / Math.max(retreatHandoffMs, 1)));
    const showcaseRevs = step === 0 ? showcaseSpin : 0;
    return showcaseRevs + retreatHandoffRevs * entranceRetreatHandoffSpinU(u);
  }

  const approachSign = resolveApproachSpinSign(rotationMode, step);
  const retreatSign = resolveRetreatSpinSign(rotationMode, step);

  const whooshSpin = shouldScaleCoupleSpin(fx);
  const inPlaceSpin = Boolean(fx && usesBaseInPlaceFanMotion(fx));
  const approachRevs = resolveApproachRevsForFx(fx, whooshSpin);
  const retreatRevs = resolveRetreatRevsForFx(fx, whooshSpin);
  const handoffRevs = resolveHandoffRevsForFx(fx, whooshSpin);
  const mixedUnwind =
    (rotationMode === "mixed" || rotationMode === "auto") && retreatSign !== approachSign
      ? FAN_MIXED_RETREAT_UNWIND_EXTRA
      : 0;
  const backSpinRevs = retreatRevs + handoffRevs + mixedUnwind;
  const retreatMs = getFanRetreatMs(profile);
  const retreatGapMs = retreatMs + FAN_GAP_MS;
  const retreatWeight = retreatMs / Math.max(retreatGapMs, 1);

  let handoffCarry = 0;
  if (inPlaceSpin && step > 0) {
    const prevApproachEnd =
      resolveApproachSpinSign(rotationMode, step - 1) * approachRevs;
    handoffCarry =
      prevApproachEnd +
      resolveRetreatSpinSign(rotationMode, step - 1) *
        backSpinRevs *
        retreatGapSpinProgress(1, retreatWeight);
  }

  if (t < approachMs) {
    const u = t / Math.max(approachMs, 1);
    const approachProgress = whooshSpin
      ? integratePresentationSpinProgress(sampleApproachPresentationScale, "approach", u)
      : inPlaceSpin
        ? approachSpinEase(u, step > 0)
        : approachSpinEase(u, step > 0);
    return handoffCarry + approachSign * approachRevs * approachProgress;
  }
  t -= approachMs;

  const showcaseMs = getFanShowcaseHoldMs(step, profile);
  const approachEnd = handoffCarry + approachSign * approachRevs;
  if (t < showcaseMs) {
    return approachEnd;
  }
  t -= showcaseMs;

  const backSpinPeak = approachEnd + retreatSign * backSpinRevs;
  if (t < retreatGapMs) {
    const u = t / Math.max(retreatGapMs, 1);
    const gapProgress = whooshSpin
      ? retreatGapWhooshSpinProgress(u, retreatWeight)
      : inPlaceSpin
        ? retreatGapSpinProgress(u, retreatWeight)   // now uses the unified handoff sub-decel for consistency
        : retreatGapSpinProgress(u, retreatWeight);
    return approachEnd + retreatSign * backSpinRevs * gapProgress;
  }
  return backSpinPeak;
}

/**
 * Approach-segment yaw only — excludes handoffCarry baked into pathFrom at step>0.
 * Use on the in-place composer yaw layer to avoid double-counting at step seams.
 */
export function getApproachYawRevsOnly(
  stepElapsedMs: number,
  step: number,
  speedMul: number = 1,
  profile: FanTimelineProfile = "wedding_default",
  rotationMode: CubeRotationMode = "mixed",
  fx?: CubeShowcaseFxOptions
): number {
  const mul = Math.max(0.35, Math.min(2.5, speedMul));
  const t = stepElapsedMs * mul;
  const approachMs = getFanApproachMs(step, profile);
  if (t <= 0) {
    return 0;
  }
  if (t >= approachMs) {
    const whooshSpin = shouldScaleCoupleSpin(fx);
    const approachRevs = resolveApproachRevsForFx(fx, whooshSpin);
    const approachSign = resolveApproachSpinSign(rotationMode, step);
    return approachSign * approachRevs;
  }
  const u = t / Math.max(approachMs, 1);
  const whooshSpin = shouldScaleCoupleSpin(fx);
  const inPlaceSpin = Boolean(fx && usesBaseInPlaceFanMotion(fx));
  const approachRevs = resolveApproachRevsForFx(fx, whooshSpin);
  const approachSign = resolveApproachSpinSign(rotationMode, step);
  const approachProgress = whooshSpin
    ? integratePresentationSpinProgress(sampleApproachPresentationScale, "approach", u)
    : inPlaceSpin
      ? approachSpinEase(u, step > 0)
      : approachSpinEase(u, step > 0);
  return approachSign * approachRevs * approachProgress;
}

/**
 * Loop yaw: approach decel → showcase freeze (2s) → retreat+handoff accel.
 */
export function getAccumulatedRevs(
  stepElapsedMs: number,
  step: number,
  speedMul: number = 1,
  profile: FanTimelineProfile = "wedding_default",
  rotationMode: CubeRotationMode = "mixed",
  fx?: CubeShowcaseFxOptions
): number {
  let base = 0;
  for (let i = 0; i < step; i += 1) {
    base += getStepSpinRevsTotal(i, profile, speedMul, rotationMode, fx);
  }
  return base + getRevsWithinStep(stepElapsedMs, step, speedMul, profile, rotationMode, fx);
}

export function fanSpinEuler(
  _seed: number,
  _step: number,
  base: THREE.Euler,
  signedRevs: number
): THREE.Euler {
  const baseQuat = new THREE.Quaternion().setFromEuler(base);
  const spinQuat = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0, 1, 0),
    signedRevs * 2 * Math.PI
  );
  // World-Y spin after showcase root — keeps every face normal on +Z.
  return new THREE.Euler().setFromQuaternion(spinQuat.clone().multiply(baseQuat));
}
