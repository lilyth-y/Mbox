/**
 * Probe the *inside* of the approach phase for step>0 to find mid-transition slowdown.
 * Samples total cube rotation at fine intervals during approach (u 0..0.7) for step=0 (baseline, clean) vs step=1 (the problematic transition).
 * Computes instantaneous ω and looks for dips or spikes exactly in the handoff-fade band (0.15-0.58).
 *
 * Run: npx tsx scripts/probe-approach-mid-slow.mjs
 */
import * as THREE from "three";
import { DEFAULT_CUBE_SHOWCASE_FX } from "../packages/shared/src/cubeShowcaseFx.ts";
import { sampleFanCubeMotion } from "../apps/web/src/features/cube/cubeFanTimeline.ts";
import { getFanApproachMs, getFanStepSegmentMs, resolveFanPhase } from "../apps/web/src/features/cube/fanTiming.ts";
import { getPresentationFace } from "../apps/web/src/features/cube/cubeSequence.ts";

const FX = { ...DEFAULT_CUBE_SHOWCASE_FX, cubeShowcaseZoomEnabled: false }; // force in-place to match the reported symptom
const PROFILE = "wedding_default";
const SPEED = 1;
const N = 6;
const SEED = 42;

const segmentMs = Array.from({ length: N }, (_, s) => getFanStepSegmentMs(s, PROFILE, SPEED));

function omegaDegPerSec(a, b, dtMs) {
  const qa = new THREE.Quaternion().setFromEuler(a.rotation);
  const qb = new THREE.Quaternion().setFromEuler(b.rotation);
  const dq = qa.clone().invert().multiply(qb);
  const angle = 2 * Math.acos(Math.min(1, Math.abs(dq.w)));
  return (angle * 180 / Math.PI) / (dtMs / 1000);
}

function sampleAtStepElapsed(step, elapsed, face) {
  return sampleFanCubeMotion(step, elapsed, face, N, SEED, "auto", PROFILE, SPEED, FX, false);
}

console.log("=== Probing approach phase internal ω profile (in-place) ===");
console.log("Looking for mid-approach slowdown specifically in u≈0.15-0.58 for step>=1\n");

for (let targetStep of [0, 1, 2]) {
  const approachMs = getFanApproachMs(targetStep, PROFILE) / SPEED;
  const startMs = targetStep === 0 ? 0 : segmentMs.slice(0, targetStep).reduce((a,b)=>a+b, 0);
  const face = getPresentationFace(targetStep);

  console.log(`\n--- step ${targetStep} approach (first 70% of ${approachMs.toFixed(0)}ms) ---`);
  const samples = [];
  const points = [0, 0.05, 0.10, 0.12, 0.15, 0.20, 0.25, 0.30, 0.35, 0.40, 0.45, 0.50, 0.55, 0.58, 0.60, 0.65, 0.70];
  for (const p of points) {
    const el = approachMs * p;
    const a = sampleAtStepElapsed(targetStep, Math.max(0, el - 4), face);
    const b = sampleAtStepElapsed(targetStep, el + 4, face);
    const w = omegaDegPerSec(a, b, 8);
    const ph = resolveFanPhase(targetStep, el, PROFILE, SPEED);
    samples.push({ p, el: el.toFixed(0), u: ph.phaseU.toFixed(3), w: w.toFixed(1) });
  }
  // print with markers for the critical band
  samples.forEach(s => {
    const inFade = s.p >= 0.15 && s.p <= 0.58 ? "  <--- FADE BAND" : "";
    const dip = parseFloat(s.w) < 30 ? "  (possible dip)" : "";
    console.log(`  p=${s.p.toFixed(2)} el=${s.el}ms u=${s.u}  ω=${s.w}°/s${inFade}${dip}`);
  });
}

console.log("\nInterpretation guide:");
console.log("- step 0 should be smooth high-to-low (hero landing decel).");
console.log("- step >=1: if there is a clear dip or sudden change exactly around p=0.15-0.58, the path/yaw handoff fade + carried yawBase is the cause.");
console.log("- Consistent low ω in that band for step>0 while step0 is still energetic = mid-transition slowdown the user sees.");
