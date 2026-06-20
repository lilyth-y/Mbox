#!/usr/bin/env node
/**
 * Orbital showcase must pass EHI-style euler spike rule @ 30fps.
 *   npx tsx scripts/verify-orbital-ehi-spikes.mjs
 */
import * as THREE from "three";
import {
  getOrbitalShowcaseSegmentMs,
  sampleOrbitalShowcaseMotion,
} from "../packages/shared/dist/index.js";
import { applyOrbitalShowcaseRootTransform } from "../apps/web/src/features/cube/orbitalPivot.ts";

const FPS = 30;
const FRAME_MS = 1000 / FPS;
const SPIKE_DEG = 12;
const SPIKE_DPS = 120;
const MAX_SPIKES = 0;

function eulerDist(a, b) {
  const dq = new THREE.Quaternion().setFromEuler(a);
  const qq = new THREE.Quaternion().setFromEuler(b);
  const dot = Math.min(1, Math.abs(dq.dot(qq)));
  return (2 * Math.acos(dot) * 180) / Math.PI;
}

function countSpikes(steps = 3) {
  const segMs = getOrbitalShowcaseSegmentMs();
  const cycleMs = segMs * steps;
  const dummy = new THREE.Group();
  dummy.userData.orbitalPivot = {
    orbitGroup: new THREE.Group(),
    spinGroup: new THREE.Group(),
  };
  dummy.add(dummy.userData.orbitalPivot.orbitGroup);
  dummy.userData.orbitalPivot.orbitGroup.add(dummy.userData.orbitalPivot.spinGroup);

  const frames = [];
  for (let t = 0; t < cycleMs; t += FRAME_MS) {
    const step = Math.floor(t / segMs);
    const stepElapsed = t - step * segMs;
    const sample = sampleOrbitalShowcaseMotion(stepElapsed, {
      step,
      faceCount: 8,
      motionSeed: 42,
    });
    applyOrbitalShowcaseRootTransform(dummy, sample);
    dummy.updateMatrixWorld(true);
    const euler = new THREE.Euler().setFromQuaternion(
      dummy.userData.orbitalPivot.spinGroup.getWorldQuaternion(new THREE.Quaternion())
    );
    frames.push({ t, euler });
  }

  let spikes = 0;
  for (let i = 1; i < frames.length; i += 1) {
    const dDeg = eulerDist(frames[i - 1].euler, frames[i].euler);
    const dt = (frames[i].t - frames[i - 1].t) / 1000;
    if (dDeg > SPIKE_DEG || dDeg / dt > SPIKE_DPS) spikes += 1;
  }
  return { spikes, cycleMs, frameCount: frames.length };
}

const { spikes, cycleMs, frameCount } = countSpikes(3);
const pass = spikes <= MAX_SPIKES;

console.log(
  JSON.stringify(
    { pass, spikes, maxAllowed: MAX_SPIKES, cycleMs, frameCount, rule: "12deg|120dps" },
    null,
    2
  )
);

if (!pass) {
  console.error(`verify-orbital-ehi-spikes: FAIL spikes=${spikes}`);
  process.exit(1);
}
console.log("verify-orbital-ehi-spikes: OK");
