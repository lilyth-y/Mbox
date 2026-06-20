#!/usr/bin/env node
/**
 * Orbital showcase: hold freeze + jerk-limited easing profile.
 */
import {
  ORBITAL_ACCEL_MS,
  ORBITAL_DECEL_MS,
  ORBITAL_JERK_BLEND_MS,
  ORBITAL_SHOWCASE_HOLD_MS,
  ORBITAL_TRAVEL_MS,
  getOrbitalShowcaseSegmentMs,
  isOrbitalShowcaseFrozen,
  measureOrbitalAngularSpeedJerkPeak,
  measureOrbitalScaleJerkPeak,
  resolveOrbitalShowcasePhase,
  sampleOrbitalShowcaseMotion,
} from "../packages/shared/dist/index.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const motionOptions = { step: 1, faceCount: 6, motionSeed: 42 };
const segmentMs = getOrbitalShowcaseSegmentMs();
const expectedSegment =
  ORBITAL_TRAVEL_MS + ORBITAL_DECEL_MS + ORBITAL_SHOWCASE_HOLD_MS + ORBITAL_ACCEL_MS;

assert(segmentMs === expectedSegment, `segment ms ${segmentMs} !== ${expectedSegment}`);
assert(segmentMs > ORBITAL_SHOWCASE_HOLD_MS, "segment includes hold window");
assert(ORBITAL_JERK_BLEND_MS >= 180, "jerk blend configured");

const holdMid = ORBITAL_TRAVEL_MS + ORBITAL_DECEL_MS + ORBITAL_SHOWCASE_HOLD_MS * 0.5;
const holdSample = sampleOrbitalShowcaseMotion(holdMid, motionOptions);

assert(holdSample.phase === "hold", `expected hold phase, got ${holdSample.phase}`);
assert(holdSample.angularSpeedFactor === 0, "angular speed must be 0 during hold");
assert(isOrbitalShowcaseFrozen(holdSample), "hold sample must be frozen");
assert(holdSample.scale >= 1.05, `scale at hold ${holdSample.scale}`);
assert(holdSample.dockingLock >= 0.98, `docking lock at hold ${holdSample.dockingLock}`);

const decelEndSample = sampleOrbitalShowcaseMotion(
  ORBITAL_TRAVEL_MS + ORBITAL_DECEL_MS,
  motionOptions
);
assert(decelEndSample.dockingLock >= 0.95, `docking lock at decel end ${decelEndSample.dockingLock}`);
assert(decelEndSample.tiltAngleRad > 0.22, `tilt at dock ${decelEndSample.tiltAngleRad}`);
assert(holdSample.holdBreath > 0.05, `hold breath mid ${holdSample.holdBreath}`);

const holdEdge = sampleOrbitalShowcaseMotion(ORBITAL_TRAVEL_MS + ORBITAL_DECEL_MS + 40, motionOptions);
assert(holdEdge.holdBreath < holdSample.holdBreath, "hold breath fades in at edge");

const phase = resolveOrbitalShowcasePhase(
  ORBITAL_TRAVEL_MS + ORBITAL_DECEL_MS + 100,
  ORBITAL_SHOWCASE_HOLD_MS
);
assert(phase.phase === "hold", "resolve phase in hold window");

const travel = sampleOrbitalShowcaseMotion(ORBITAL_TRAVEL_MS * 0.5, {
  step: 0,
  faceCount: 8,
});
assert(travel.angularSpeedFactor > 0, "travel must move");

const omegaJerkPeak = measureOrbitalAngularSpeedJerkPeak(motionOptions);
const scaleJerkPeak = measureOrbitalScaleJerkPeak(motionOptions);
assert(omegaJerkPeak < 0.0025, `angular speed jerk peak too high: ${omegaJerkPeak}`);
assert(scaleJerkPeak < 0.00072, `scale jerk peak too high: ${scaleJerkPeak}`);

console.log("verify-orbital-showcase-motion: OK", {
  segmentMs,
  holdMs: ORBITAL_SHOWCASE_HOLD_MS,
  holdScale: holdSample.scale,
  omegaJerkPeak,
  scaleJerkPeak,
});
