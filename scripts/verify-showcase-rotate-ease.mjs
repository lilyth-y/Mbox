#!/usr/bin/env node
/**
 * Tier-1: rotate ease integral preserves total yaw vs legacy constant spin.
 */
function clamp01(t) {
  return Math.max(0, Math.min(1, t));
}

function easeInOutCubic(t) {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
}

function simulateEasedTotalYaw(durationMs, peakSpeedY, dtMs = 16.67) {
  let yaw = 0;
  for (let elapsed = 0; elapsed < durationMs; elapsed += dtMs) {
    const totalYaw = Math.abs(peakSpeedY) * (durationMs * 0.001);
    const t0 = elapsed / durationMs;
    const t1 = Math.min(1, (elapsed + dtMs) / durationMs);
    yaw += totalYaw * (easeInOutCubic(t1) - easeInOutCubic(t0));
  }
  return yaw;
}

function simulateConstantTotalYaw(durationMs, peakSpeedY, dtMs = 16.67) {
  let yaw = 0;
  for (let elapsed = 0; elapsed < durationMs; elapsed += dtMs) {
    yaw += Math.abs(peakSpeedY) * (dtMs * 0.001);
  }
  return yaw;
}

const durationMs = 3400;
const peakSpeedY = 0.9;
const constant = simulateConstantTotalYaw(durationMs, peakSpeedY);
const eased = simulateEasedTotalYaw(durationMs, peakSpeedY);
const delta = Math.abs(constant - eased);
const tol = 0.02;

console.log(`constant total yaw: ${constant.toFixed(4)} rad`);
console.log(`eased total yaw:    ${eased.toFixed(4)} rad`);
console.log(`delta:              ${delta.toFixed(4)} rad (tol ${tol})`);

if (delta > tol) {
  console.error("verify-showcase-rotate-ease: FAIL");
  process.exit(1);
}

// End-of-phase velocity should be near zero (ease-out)
const dt = 16.67;
const endSpeed = (() => {
  const totalYaw = Math.abs(peakSpeedY) * (durationMs * 0.001);
  const t0 = (durationMs - dt) / durationMs;
  const t1 = 1;
  const deltaYaw = totalYaw * (easeInOutCubic(t1) - easeInOutCubic(t0));
  return deltaYaw / (dt * 0.001);
})();
const startSpeed = (() => {
  const totalYaw = Math.abs(peakSpeedY) * (durationMs * 0.001);
  const deltaYaw = totalYaw * (easeInOutCubic(dt / durationMs) - easeInOutCubic(0));
  return deltaYaw / (dt * 0.001);
})();

console.log(`start equiv speedY: ${startSpeed.toFixed(4)} (peak ${peakSpeedY})`);
console.log(`end equiv speedY:   ${endSpeed.toFixed(4)}`);

if (startSpeed >= peakSpeedY * 0.95) {
  console.error("FAIL: start speed should ease in from below peak");
  process.exit(1);
}
if (endSpeed > peakSpeedY * 0.08) {
  console.error("FAIL: end speed should ease out near zero");
  process.exit(1);
}

console.log("verify-showcase-rotate-ease: OK");

function endEaseOutSpeed(durationMs, peakSpeedY, dtMs = 16.67) {
  const totalYaw = Math.abs(peakSpeedY) * (durationMs * 0.001);
  const t0 = (durationMs - dtMs) / durationMs;
  const deltaYaw = totalYaw * (easeOutCubic(1) - easeOutCubic(t0));
  return deltaYaw / (dtMs * 0.001);
}

function easeOutCubic(t) {
  const x = Math.max(0, Math.min(1, t));
  return 1 - (1 - x) ** 3;
}

const leadMs = 1200;
const endLead = endEaseOutSpeed(leadMs, 0.9);
console.log(`pull lead end speedY: ${endLead.toFixed(4)} (should be ~0)`);
if (endLead > 0.08) {
  console.error("FAIL: pull lead ease-out end speed too high");
  process.exit(1);
}
console.log("verify-showcase-pull-spin: OK");
