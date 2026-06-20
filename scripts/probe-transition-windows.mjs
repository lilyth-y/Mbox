import * as THREE from "three";
import {
  sampleFanCubeMotion,
  computeFanLoopBridgeFrame,
  getFanStepSegmentMs,
} from "../apps/web/src/features/cube/cubeFanTimeline";
import { getPresentationFace } from "../apps/web/src/features/cube/cubeSequence";

function quatFromEuler(e) {
  return new THREE.Quaternion().setFromEuler(e).normalize();
}

function angleDeg(a, b) {
  const qa = quatFromEuler(a);
  const qb = quatFromEuler(b);
  const dot = Math.abs(qa.dot(qb));
  return (2 * Math.acos(Math.min(1, Math.max(-1, dot))) * 180) / Math.PI;
}

function omegaDegPerSec(prev, next, dtMs) {
  const d = angleDeg(prev, next);
  return (d / Math.max(dtMs, 1e-6)) * 1000;
}

function sampleRotation(step, elapsedMs, presentationCount, motionSeed, rotationMode, profile, speedMul, fx) {
  const face = getPresentationFace(step);
  return sampleFanCubeMotion(
    step,
    elapsedMs,
    face,
    presentationCount,
    motionSeed,
    rotationMode,
    profile,
    speedMul,
    fx,
    false
  ).rotation;
}

const presentationCount = 6;
const motionSeed = 0;
const rotationMode = "mixed";
const profile = "wedding_default";
const speedMul = 1;
const fx = {
  cubeHeartbeatEnabled: false,
  cubeShowcaseZoomEnabled: true,
  cubeComplexRotationEnabled: true,
  cubeSubjectPullEnabled: true,
  cubeScaleCoupledSpinEnabled: true,
  cubeZoomIntensity: 1,
  cubeComplexRotationIntensity: 1,
  cubeAcceleratedSpinIntensity: 1,
  cubeSubjectPullIntensity: 1,
  cubeHeartbeatIntensity: 1,
};

const windowMs = 140;
const stepDt = 16; // approximate preview frame

function probeStepSeam(prevStep) {
  const nextStep = prevStep + 1;
  const prevDur = getFanStepSegmentMs(prevStep, profile, speedMul);
  const prevEnd = Math.max(0, prevDur - 1);
  console.log(`\n=== step seam ${prevStep}→${nextStep} (handoff→approach) ===`);
  const prevRot = sampleRotation(prevStep, prevEnd, presentationCount, motionSeed, rotationMode, profile, speedMul, fx);
  const nextRot = sampleRotation(nextStep, 0, presentationCount, motionSeed, rotationMode, profile, speedMul, fx);
  console.log(`Δθ(end→start)=${angleDeg(prevRot, nextRot).toFixed(3)}°`);

  // omega tail/head
  const prevTail0 = sampleRotation(prevStep, Math.max(0, prevEnd - stepDt), presentationCount, motionSeed, rotationMode, profile, speedMul, fx);
  const omegaTail = omegaDegPerSec(prevTail0, prevRot, stepDt);
  const nextHead1 = sampleRotation(nextStep, stepDt, presentationCount, motionSeed, rotationMode, profile, speedMul, fx);
  const omegaHead = omegaDegPerSec(nextRot, nextHead1, stepDt);
  console.log(`ω tail≈${omegaTail.toFixed(1)}°/s  ω head≈${omegaHead.toFixed(1)}°/s`);

  // detailed window on both sides (dt = 16ms)
  console.log(`samples (prev tail):`);
  for (let t = prevEnd - windowMs; t <= prevEnd; t += stepDt) {
    const r0 = sampleRotation(prevStep, Math.max(0, t), presentationCount, motionSeed, rotationMode, profile, speedMul, fx);
    const r1 = sampleRotation(prevStep, Math.max(0, t + stepDt), presentationCount, motionSeed, rotationMode, profile, speedMul, fx);
    const w = omegaDegPerSec(r0, r1, stepDt);
    if (t >= prevEnd - 48) {
      console.log(`  t=${t.toFixed(0).padStart(5)}ms  ω≈${w.toFixed(1).padStart(6)}°/s`);
    }
  }
  console.log(`samples (next head):`);
  for (let t = 0; t <= windowMs; t += stepDt) {
    const r0 = sampleRotation(nextStep, t, presentationCount, motionSeed, rotationMode, profile, speedMul, fx);
    const r1 = sampleRotation(nextStep, t + stepDt, presentationCount, motionSeed, rotationMode, profile, speedMul, fx);
    const w = omegaDegPerSec(r0, r1, stepDt);
    if (t <= 48) {
      console.log(`  t=${t.toFixed(0).padStart(4)}ms  ω≈${w.toFixed(1).padStart(6)}°/s`);
    }
  }
}

for (let s = 0; s < presentationCount - 1; s += 1) {
  probeStepSeam(s);
}

// loop bridge entry: last step end → bridgeElapsed=0
{
  const lastStep = presentationCount - 1;
  const lastDur = getFanStepSegmentMs(lastStep, profile, speedMul);
  const lastEnd = Math.max(0, lastDur - 1);
  const lastRot = sampleRotation(lastStep, lastEnd, presentationCount, motionSeed, rotationMode, profile, speedMul, fx);
  const bridge = computeFanLoopBridgeFrame(
    0,
    1200,
    lastStep,
    motionSeed,
    rotationMode,
    profile,
    speedMul,
    fx
  );
  console.log(`\n=== loop bridge entry (step ${lastStep} end → bridgeElapsed=0) ===`);
  console.log(`Δθ=${angleDeg(lastRot, bridge.fanRootMotion.rotation).toFixed(3)}°`);
}

