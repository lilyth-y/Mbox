#!/usr/bin/env node
/**
 * Tier-1: presentation spin curves + stage-boundary continuity.
 */
function clamp01(t) {
  return Math.max(0, Math.min(1, t));
}

function easeInOutUniformAccel(t) {
  const x = clamp01(t);
  return x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2;
}

function easeInUniformAccel(t) {
  const x = clamp01(t);
  return x * x;
}

function easeOutUniformDecel(t) {
  const x = clamp01(t);
  return 1 - (1 - x) ** 2;
}

function computeIntegralEaseSpinSpeedY(phaseElapsedMs, dtMs, durationMs, peakSpeedY) {
  if (durationMs <= 0 || dtMs <= 0) return 0;
  const totalYaw = Math.abs(peakSpeedY) * (durationMs * 0.001);
  const t0 = phaseElapsedMs / durationMs;
  const t1 = Math.min(1, (phaseElapsedMs + dtMs) / durationMs);
  const deltaYaw = totalYaw * (easeInOutUniformAccel(t1) - easeInOutUniformAccel(t0));
  return deltaYaw / (dtMs * 0.001);
}

function computeIntegralEaseInCruiseSpinSpeedY(
  phaseElapsedMs,
  dtMs,
  durationMs,
  peakSpeedY,
  easeInPortion = 0.25
) {
  if (durationMs <= 0 || dtMs <= 0) return 0;
  const easeMs = Math.max(1, durationMs * clamp01(easeInPortion));
  if (phaseElapsedMs >= easeMs) return peakSpeedY;
  const totalYaw = Math.abs(peakSpeedY) * (easeMs * 0.001);
  const t0 = phaseElapsedMs / easeMs;
  const t1 = Math.min(1, (phaseElapsedMs + dtMs) / easeMs);
  const deltaYaw = totalYaw * (easeInUniformAccel(t1) - easeInUniformAccel(t0));
  return deltaYaw / (dtMs * 0.001);
}

function computeSpinDecayTargetSpeedY(phaseElapsedMs, durationMs, entrySpeedY) {
  if (durationMs <= 0) return 0;
  const t = clamp01(phaseElapsedMs / durationMs);
  return Math.abs(entrySpeedY) * (1 - easeOutUniformDecel(t));
}

function approachSpinOmega(current, target, dtMs, maxAccel = 16) {
  const maxDelta = maxAccel * (dtMs * 0.001);
  const delta = target - current;
  if (Math.abs(delta) <= maxDelta) return target;
  return current + Math.sign(delta) * maxDelta;
}

function simulateSegment(getTarget, durationMs, dtMs = 16.67, startOmega = 0) {
  let omega = startOmega;
  const samples = [];
  for (let elapsed = 0; elapsed < durationMs; elapsed += dtMs) {
    const target = getTarget(elapsed, dtMs);
    omega = approachSpinOmega(omega, target, dtMs);
    samples.push(omega);
  }
  return samples;
}

const peakSpeedY = 0.9;
const dt = 16.67;

// Legacy ease-in/out still used for morph-only segments in isolation tests
const rotateMs = 3400;
const easedTotal = (() => {
  let yaw = 0;
  for (let e = 0; e < rotateMs; e += dt) {
    yaw += computeIntegralEaseSpinSpeedY(e, dt, rotateMs, peakSpeedY) * (dt * 0.001);
  }
  return yaw;
})();
const constantTotal = peakSpeedY * (rotateMs * 0.001);
if (Math.abs(constantTotal - easedTotal) > 0.05) {
  console.error("FAIL: legacy ease-in/out integral drift");
  process.exit(1);
}

// Ease-in-cruise: end at peak, not zero
const cruiseMs = 5600;
const cruiseSamples = simulateSegment(
  (elapsed, step) =>
    computeIntegralEaseInCruiseSpinSpeedY(elapsed, step, cruiseMs, peakSpeedY, 0.2),
  cruiseMs,
  dt
);
const endCruise = cruiseSamples[cruiseSamples.length - 1] ?? 0;
const midCruise = cruiseSamples[Math.floor(cruiseSamples.length * 0.85)] ?? 0;
console.log(`ease-in-cruise end ω: ${endCruise.toFixed(3)} (expect ~${peakSpeedY})`);
if (Math.abs(endCruise - peakSpeedY) > 0.12) {
  console.error("FAIL: ease-in-cruise should end near peak speed");
  process.exit(1);
}
if (midCruise < peakSpeedY * 0.7) {
  console.error("FAIL: ease-in-cruise mid segment should cruise near peak");
  process.exit(1);
}

// rotate+morph → pull: no near-zero gap at boundary
const morphMs = 2200;
const segmentMs = rotateMs + morphMs;
const rotateMorphSamples = simulateSegment(
  (elapsed, step) =>
    computeIntegralEaseInCruiseSpinSpeedY(elapsed, step, segmentMs, peakSpeedY, 0.2),
  segmentMs,
  dt
);
const omegaAtPullHandoff = rotateMorphSamples[rotateMorphSamples.length - 1] ?? 0;
const zoomStartMs = 1200 * 0.55;
const pullLeadSamples = simulateSegment(
  (elapsed) => computeSpinDecayTargetSpeedY(elapsed, zoomStartMs, omegaAtPullHandoff),
  zoomStartMs,
  dt,
  omegaAtPullHandoff
);
const omegaAfterPullBridge = pullLeadSamples[1] ?? 0;
const boundaryDrop = Math.abs(omegaAtPullHandoff - omegaAfterPullBridge);
console.log(
  `rotate→pull boundary Δω: ${boundaryDrop.toFixed(3)} (handoff ${omegaAtPullHandoff.toFixed(3)})`
);
if (boundaryDrop > 0.35) {
  console.error("FAIL: large spin discontinuity at rotate→pull");
  process.exit(1);
}

// Ascend return radius target must be stable (no per-frame breathe on endpoint)
let movingEndpoint = 0;
let frozenEndpoint = 0;
const returnMs = 3200;
for (let t = 0; t < returnMs; t += dt) {
  const breathe = Math.sin((t * 0.001 * Math.PI * 2) / 5.2) * 0.04;
  movingEndpoint += 3.2 * (0.64 + breathe);
  frozenEndpoint += 3.2 * 0.64;
}
const endpointJitter = Math.abs(movingEndpoint - frozenEndpoint) / (returnMs / dt);
console.log(`ascend frozen vs breathe radius drift/frame: ${endpointJitter.toFixed(5)}`);
if (endpointJitter < 0.0005) {
  console.error("FAIL: ascend jerk regression test setup broken");
  process.exit(1);
}

console.log("verify-showcase-rotate-ease: OK");
