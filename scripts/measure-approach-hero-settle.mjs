/**
 * Profile |ω| during approach hero settle (u ≥ 0.62).
 *   npx tsx scripts/measure-approach-hero-settle.mjs
 */
import * as THREE from "three";
import { DEFAULT_CUBE_SHOWCASE_FX } from "../packages/shared/src/cubeShowcaseFx.ts";
import { sampleFanCubeMotion } from "../apps/web/src/features/cube/cubeFanTimeline.ts";
import { runWithFanMotionExportRecording } from "../apps/web/src/features/cube/fanExportRotation.ts";
import { getPresentationFace } from "../apps/web/src/features/cube/cubeSequence.ts";
import { resolveFanPhase, getFanApproachMs } from "../apps/web/src/features/cube/fanTiming.ts";

const FRAME_MS = 1000 / 30;
const STEP = 1;
const N = 6;
const SEED = 42;
const FX = { ...DEFAULT_CUBE_SHOWCASE_FX, cubeShowcaseZoomEnabled: true };
const approachMs = getFanApproachMs(STEP, "wedding_default");

function omegaAt(stepElapsed, exportRecording) {
  const face = getPresentationFace(STEP);
  const a = runWithFanMotionExportRecording(exportRecording, () =>
    sampleFanCubeMotion(STEP, stepElapsed - FRAME_MS, face, N, SEED, "mixed", "wedding_default", 1, FX, exportRecording)
  );
  const b = runWithFanMotionExportRecording(exportRecording, () =>
    sampleFanCubeMotion(STEP, stepElapsed, face, N, SEED, "mixed", "wedding_default", 1, FX, exportRecording)
  );
  const qa = new THREE.Quaternion().setFromEuler(a.rotation);
  const qb = new THREE.Quaternion().setFromEuler(b.rotation);
  const dq = qa.invert().multiply(qb);
  const deg = (2 * Math.acos(Math.min(1, Math.abs(dq.w))) * 180) / Math.PI;
  const phase = resolveFanPhase(STEP, stepElapsed, "wedding_default", 1);
  return {
    ms: stepElapsed,
    phaseU: phase.phaseU,
    omega: deg / (FRAME_MS / 1000),
    scale: b.presentationScale,
  };
}

function profile(label, exportRecording) {
  const rows = [];
  for (let t = approachMs * 0.62; t <= approachMs; t += FRAME_MS) {
    rows.push(omegaAt(t, exportRecording));
  }
  const tail = rows.filter((r) => r.phaseU >= 0.82);
  const peakOmega = Math.max(...rows.map((r) => r.omega));
  const tailMean = tail.reduce((s, r) => s + r.omega, 0) / Math.max(tail.length, 1);
  const last = rows[rows.length - 1];
  console.log(`\n[${label}] step ${STEP} approach hero settle`);
  console.log(`  peak |ω| (u≥0.62): ${peakOmega.toFixed(1)}°/s`);
  console.log(`  mean |ω| (u≥0.82): ${tailMean.toFixed(1)}°/s`);
  console.log(`  final (u=${last.phaseU.toFixed(3)}): ${last.omega.toFixed(1)}°/s scale=${last.scale.toFixed(3)}`);
  console.log("  samples u≥0.82:");
  for (const r of tail) {
    console.log(`    u=${r.phaseU.toFixed(3)} ω=${r.omega.toFixed(1)}°/s`);
  }
  return { peakOmega, tailMean, lastOmega: last.omega };
}

profile("preview", false);
profile("export", true);
console.log("\n--- target: tail mean < 25°/s, monotonic ω↓ in u≥0.82 ---");
