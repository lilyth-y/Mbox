import type { Scene } from "@babylonjs/core/scene";
import type { ShowcaseBackdropSample } from "./showcaseBackdropSampler";
import {
  applyCrystalHarmonyToScene,
  classifyCrystalHarmonyProfile,
  computeCrystalHarmonyTuningForProfile,
  lerpCrystalHarmonyTuning,
  type CrystalHarmonyProfile,
  type CrystalHarmonyTuning,
} from "./showcaseCrystalHarmony";

const SAMPLE_EMA = 0.14;
const TUNING_TIME_MS = 1400;

let smoothedSample: ShowcaseBackdropSample | null = null;
let lockedProfile: CrystalHarmonyProfile | null = null;
let targetTuning: CrystalHarmonyTuning | null = null;
let currentTuning: CrystalHarmonyTuning | null = null;
let targetInfluence = 0.72;

function lerpChannel(prev: number, next: number, alpha: number): number {
  return prev + (next - prev) * alpha;
}

function blendBackdropSample(
  prev: ShowcaseBackdropSample,
  next: ShowcaseBackdropSample,
  alpha: number
): ShowcaseBackdropSample {
  return {
    average: {
      r: lerpChannel(prev.average.r, next.average.r, alpha),
      g: lerpChannel(prev.average.g, next.average.g, alpha),
      b: lerpChannel(prev.average.b, next.average.b, alpha),
    },
    bright: {
      r: lerpChannel(prev.bright.r, next.bright.r, alpha),
      g: lerpChannel(prev.bright.g, next.bright.g, alpha),
      b: lerpChannel(prev.bright.b, next.bright.b, alpha),
    },
    luminance: lerpChannel(prev.luminance, next.luminance, alpha),
  };
}

function resolveHarmonyProfile(sample: ShowcaseBackdropSample): CrystalHarmonyProfile {
  const lum = sample.luminance;
  if (lockedProfile === "dark" && lum < 0.2) {
    return "dark";
  }
  if (lockedProfile === "bright" && lum > 0.48) {
    return "bright";
  }
  if (lockedProfile === "neutral" && lum >= 0.14 && lum <= 0.54) {
    return "neutral";
  }
  lockedProfile = classifyCrystalHarmonyProfile(sample);
  return lockedProfile;
}

function refreshTargetTuning(): void {
  if (!smoothedSample) {
    return;
  }
  const profile = resolveHarmonyProfile(smoothedSample);
  targetTuning = computeCrystalHarmonyTuningForProfile(
    smoothedSample,
    targetInfluence,
    profile
  );
  if (!currentTuning) {
    currentTuning = lerpCrystalHarmonyTuning(targetTuning, targetTuning, 1);
  }
}

export function pushBackdropHarmonySample(
  raw: ShowcaseBackdropSample,
  influence: number
): void {
  targetInfluence = Math.max(0, Math.min(1, influence));
  smoothedSample = smoothedSample
    ? blendBackdropSample(smoothedSample, raw, SAMPLE_EMA)
    : raw;
  refreshTargetTuning();
}

export function setStaticBackdropHarmonySample(
  sample: ShowcaseBackdropSample,
  influence: number
): void {
  targetInfluence = Math.max(0, Math.min(1, influence));
  smoothedSample = sample;
  lockedProfile = classifyCrystalHarmonyProfile(sample);
  targetTuning = computeCrystalHarmonyTuningForProfile(
    sample,
    targetInfluence,
    lockedProfile
  );
  currentTuning = lerpCrystalHarmonyTuning(targetTuning, targetTuning, 1);
}

export function getSmoothedBackdropSample(): ShowcaseBackdropSample | null {
  return smoothedSample;
}

export function getCurrentHarmonyTuning(): CrystalHarmonyTuning | null {
  return currentTuning;
}

export function getHarmonyInfluence(): number {
  return targetInfluence;
}

export function updateHarmonyInfluence(influence: number): void {
  targetInfluence = Math.max(0, Math.min(1, influence));
  refreshTargetTuning();
}

export function tickShowcaseHarmonyState(dtMs: number, scene: Scene): void {
  if (!targetTuning) {
    return;
  }
  if (!currentTuning) {
    currentTuning = lerpCrystalHarmonyTuning(targetTuning, targetTuning, 1);
  }
  const alpha = 1 - Math.exp(-dtMs / TUNING_TIME_MS);
  currentTuning = lerpCrystalHarmonyTuning(currentTuning, targetTuning, alpha);
  applyCrystalHarmonyToScene(scene, currentTuning, 1);
}

export function resetShowcaseHarmonyState(): void {
  smoothedSample = null;
  lockedProfile = null;
  targetTuning = null;
  currentTuning = null;
  targetInfluence = 0.72;
}
