/**
 * Segment-wise cube rotation velocity & C¹ continuity analysis.
 *   npx tsx scripts/analyze-rotation-velocity-by-segment.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { DEFAULT_CUBE_SHOWCASE_FX } from "../packages/shared/src/cubeShowcaseFx.ts";
import { sampleFanCubeMotion } from "../apps/web/src/features/cube/cubeFanTimeline.ts";
import { runWithFanMotionExportRecording } from "../apps/web/src/features/cube/fanExportRotation.ts";
import { getPresentationFace } from "../apps/web/src/features/cube/cubeSequence.ts";
import { resolvePresentationTimeline } from "../apps/web/src/features/cube/cubeMotionVariety.ts";
import {
  getFanStepSegmentMs,
  resolveFanPhase,
  FAN_GAP_MS,
} from "../apps/web/src/features/cube/fanTiming.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "experiments", "outputs", "rotation_velocity");
mkdirSync(outDir, { recursive: true });

const FPS = 30;
const FRAME_MS = 1000 / FPS;
const FINE_MS = 8;
const N = 6;
const SEED = 42;
const FX = { ...DEFAULT_CUBE_SHOWCASE_FX };
const PROFILE = "wedding_default";
const SPEED = 1;

const segmentMs = Array.from({ length: N }, (_, s) =>
  getFanStepSegmentMs(s, PROFILE, SPEED)
);
const totalMs = segmentMs.reduce((a, b) => a + b, 0);

function quatFromSample(ms, exportRecording) {
  const resolved = resolvePresentationTimeline(ms, segmentMs, 0);
  if (resolved.kind !== "step") return null;
  const { step, stepElapsed } = resolved;
  const phase = resolveFanPhase(step, stepElapsed, PROFILE, SPEED);
  const face = getPresentationFace(step);
  const motion = runWithFanMotionExportRecording(exportRecording, () =>
    sampleFanCubeMotion(
      step,
      stepElapsed,
      face,
      N,
      SEED,
      "auto",
      PROFILE,
      SPEED,
      FX,
      exportRecording
    )
  );
  const q = new THREE.Quaternion().setFromEuler(motion.rotation);
  return {
    ms,
    step,
    stepElapsed,
    phase: phase.phase,
    phaseU: phase.phaseU,
    phaseElapsed: phase.phaseElapsed,
    scale: motion.presentationScale,
    q,
  };
}

function omegaDegPerSec(a, b, dtMs) {
  const dq = new THREE.Quaternion().copy(a.q).invert().multiply(b.q);
  const angleDeg = 2 * Math.acos(Math.min(1, Math.abs(dq.w))) * (180 / Math.PI);
  return angleDeg / (dtMs / 1000);
}

function buildSeries(exportRecording, dtMs) {
  const frames = [];
  for (let ms = 0; ms <= totalMs; ms += dtMs) {
    const s = quatFromSample(ms, exportRecording);
    if (s) frames.push(s);
  }
  const series = [];
  for (let i = 1; i < frames.length; i += 1) {
    const prev = frames[i - 1];
    const cur = frames[i];
    const dt = cur.ms - prev.ms;
    const omega = omegaDegPerSec(prev, cur, dt);
    series.push({ ...cur, omega, dt });
  }
  const withAlpha = [];
  for (let i = 1; i < series.length; i += 1) {
    const prev = series[i - 1];
    const cur = series[i];
    const dt = (prev.dt + cur.dt) * 0.5;
    const alpha = (cur.omega - prev.omega) / (dt / 1000);
    const dOmega = Math.abs(cur.omega - prev.omega);
    withAlpha.push({ ...cur, alpha, dOmega });
  }
  return { frames, series: withAlpha };
}

function stats(nums) {
  if (!nums.length) return { n: 0, min: 0, max: 0, mean: 0, p50: 0, p95: 0 };
  const sorted = [...nums].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  return {
    n: sorted.length,
    min: +sorted[0].toFixed(2),
    max: +sorted[sorted.length - 1].toFixed(2),
    mean: +(sum / sorted.length).toFixed(2),
    p50: +sorted[Math.floor(sorted.length * 0.5)].toFixed(2),
    p95: +sorted[Math.floor(sorted.length * 0.95)].toFixed(2),
  };
}

function phaseStats(series) {
  const phases = ["approach", "showcase_hold", "retreat", "handoff"];
  const out = {};
  for (const phase of phases) {
    const omega = series.filter((s) => s.phase === phase).map((s) => Math.abs(s.omega));
    const alpha = series.filter((s) => s.phase === phase).map((s) => Math.abs(s.alpha));
    out[phase] = {
      omegaDegPerSec: stats(omega),
      alphaDegPerSec2: stats(alpha),
    };
  }
  return out;
}

function findC1Breaks(series, opts) {
  const { samePhaseOnly = true, dOmegaThreshold = 18, alphaThreshold = 2500 } = opts;
  const hits = [];
  for (let i = 1; i < series.length; i += 1) {
    const prev = series[i - 1];
    const s = series[i];
    if (samePhaseOnly && prev.phase !== s.phase) continue;
    if (s.dOmega >= dOmegaThreshold || Math.abs(s.alpha) >= alphaThreshold) {
      hits.push({
        ms: Math.round(s.ms),
        step: s.step,
        phase: s.phase,
        phaseU: +s.phaseU.toFixed(3),
        omega: +s.omega.toFixed(1),
        dOmega: +s.dOmega.toFixed(1),
        alpha: +s.alpha.toFixed(0),
        scale: +s.scale.toFixed(3),
      });
    }
  }
  return hits.sort((a, b) => b.dOmega - a.dOmega);
}

function phaseBoundaries(series, frames) {
  const hits = [];
  for (let i = 1; i < series.length; i += 1) {
    const prev = series[i - 1];
    const cur = series[i];
    if (prev.phase === cur.phase) continue;
    const prevQ = frames[i]?.q;
    const curQ = frames[i + 1]?.q;
    let angleDeg = 0;
    if (prevQ && curQ) {
      const dq = new THREE.Quaternion().copy(prevQ).invert().multiply(curQ);
      angleDeg = 2 * Math.acos(Math.min(1, Math.abs(dq.w))) * (180 / Math.PI);
    }
    hits.push({
      ms: Math.round(cur.ms),
      step: cur.step,
      from: prev.phase,
      to: cur.phase,
      omegaBefore: +prev.omega.toFixed(1),
      omegaAfter: +cur.omega.toFixed(1),
      dOmega: +(cur.omega - prev.omega).toFixed(1),
      angleJumpDeg: +angleDeg.toFixed(2),
      scale: +cur.scale.toFixed(3),
      c0: angleDeg > 2,
      c1: Math.abs(cur.omega - prev.omega) > 25,
    });
  }
  return hits;
}

function stepBoundaries(series, frames) {
  const hits = [];
  for (let i = 1; i < series.length; i += 1) {
    const prev = series[i - 1];
    const cur = series[i];
    if (prev.step === cur.step) continue;
    const prevQ = frames[i]?.q;
    const curQ = frames[i + 1]?.q;
    let angleDeg = 0;
    if (prevQ && curQ) {
      const dq = new THREE.Quaternion().copy(prevQ).invert().multiply(curQ);
      angleDeg = 2 * Math.acos(Math.min(1, Math.abs(dq.w))) * (180 / Math.PI);
    }
    hits.push({
      ms: Math.round(cur.ms),
      stepFrom: prev.step,
      stepTo: cur.step,
      phase: cur.phase,
      fromPhase: prev.phase,
      omegaBefore: +prev.omega.toFixed(1),
      omegaAfter: +cur.omega.toFixed(1),
      angleJumpDeg: +angleDeg.toFixed(2),
      c0: angleDeg > 2,
      c1: Math.abs(cur.omega - prev.omega) > 25,
    });
  }
  return hits;
}

function approachTailProfile(series, step = 0) {
  const segStart = segmentMs.slice(0, step).reduce((a, b) => a + b, 0);
  const approach = series.filter(
    (s) => s.step === step && s.phase === "approach" && s.phaseU >= 0.65
  );
  return approach.map((s) => ({
    ms: Math.round(s.ms),
    phaseU: +s.phaseU.toFixed(3),
    omega: +s.omega.toFixed(1),
    alpha: +s.alpha.toFixed(0),
    scale: +s.scale.toFixed(3),
  }));
}

function analyze(exportRecording) {
  const coarse = buildSeries(exportRecording, FRAME_MS);
  const fine = buildSeries(exportRecording, FINE_MS);

  const label = exportRecording ? "export" : "preview";
  const phaseBoundary = phaseBoundaries(coarse.series, coarse.frames);
  const stepBoundary = stepBoundaries(coarse.series, coarse.frames);
  const c1Within = findC1Breaks(fine.series, {
    samePhaseOnly: true,
    dOmegaThreshold: 12,
    alphaThreshold: 1800,
  });
  const c1Global = findC1Breaks(fine.series, {
    samePhaseOnly: false,
    dOmegaThreshold: 20,
    alphaThreshold: 2200,
  });

  return {
    label,
    meta: { totalMs, fps: FPS, fineDtMs: FINE_MS, steps: N },
    phaseStats: phaseStats(coarse.series),
    phaseBoundaries: phaseBoundary,
    stepBoundaries: stepBoundary,
    c1WithinPhase: c1Within.slice(0, 20),
    c1All: c1Global.slice(0, 15),
    approachTailStep0: approachTailProfile(coarse.series, 0),
    approachTailStep1: approachTailProfile(coarse.series, 1),
    summary: {
      phaseC0Count: phaseBoundary.filter((b) => b.c0).length,
      phaseC1Count: phaseBoundary.filter((b) => b.c1).length,
      stepC0Count: stepBoundary.filter((b) => b.c0).length,
      stepC1Count: stepBoundary.filter((b) => b.c1).length,
      withinPhaseC1Count: c1Within.length,
    },
  };
}

const reports = [false, true].map(analyze);
const combined = { generatedAt: new Date().toISOString(), reports };
writeFileSync(
  join(outDir, "rotation_velocity_by_segment.json"),
  JSON.stringify(combined, null, 2)
);

function printReport(r) {
  console.log(`\n${"=".repeat(72)}`);
  console.log(` ${r.label.toUpperCase()} — rotation velocity by segment`);
  console.log("=".repeat(72));

  console.log("\n[구간별 |ω| 통계 deg/s]  (alpha = deg/s²)");
  for (const [phase, st] of Object.entries(r.phaseStats)) {
    const o = st.omegaDegPerSec;
    const a = st.alphaDegPerSec2;
    console.log(
      `  ${phase.padEnd(14)} ω mean=${o.mean} p95=${o.p95} max=${o.max}  |  α p95=${a.p95} max=${a.max}`
    );
  }

  console.log(`\n[요약] phase C⁰ jumps=${r.summary.phaseC0Count}  phase C¹ breaks=${r.summary.phaseC1Count}`);
  console.log(`       step  C⁰ jumps=${r.summary.stepC0Count}  step  C¹ breaks=${r.summary.stepC1Count}`);
  console.log(`       within-phase C¹ spikes (fine ${FINE_MS}ms)=${r.summary.withinPhaseC1Count}`);

  console.log("\n[Phase 경계 — C⁰(각도) / C¹(ω)]");
  for (const b of r.phaseBoundaries) {
    const flags = [b.c0 ? "C⁰" : "", b.c1 ? "C¹" : ""].filter(Boolean).join("+") || "ok";
    console.log(
      `  ${String(b.ms).padStart(5)}ms step${b.step} ${b.from}→${b.to}  ` +
        `Δθ=${b.angleJumpDeg}°  ω ${b.omegaBefore}→${b.omegaAfter} (Δω=${b.dOmega})  [${flags}]`
    );
  }

  console.log("\n[Step 경계 — 사진 전환]");
  for (const b of r.stepBoundaries) {
    const flags = [b.c0 ? "C⁰" : "", b.c1 ? "C¹" : ""].join("+") || "ok";
    console.log(
      `  ${String(b.ms).padStart(5)}ms ${b.stepFrom}→${b.stepTo} (${b.fromPhase}→${b.phase})  ` +
        `Δθ=${b.angleJumpDeg}°  ω ${b.omegaBefore}→${b.omegaAfter}  [${flags}]`
    );
  }

  if (r.c1WithinPhase.length) {
    console.log("\n[구간 내 C¹ 급변 TOP — 미분 불연속 후보]");
    for (const h of r.c1WithinPhase.slice(0, 8)) {
      console.log(
        `  ${h.ms}ms step${h.step} ${h.phase} u=${h.phaseU}  ω=${h.omega} Δω=${h.dOmega} α=${h.alpha}`
      );
    }
  }

  console.log("\n[Approach 마지막 35% — step0 ω 궤적 (u≥0.65)]");
  const tail = r.approachTailStep0;
  if (tail.length >= 4) {
    const last = tail[tail.length - 1];
    const mid = tail[Math.floor(tail.length * 0.5)];
    console.log(
      `  u=${mid.phaseU} ω=${mid.omega}°/s  →  u=${last.phaseU} ω=${last.omega}°/s  (scale ${last.scale})`
    );
  }
}

for (const r of reports) printReport(r);

console.log(`\n→ JSON: experiments/outputs/rotation_velocity/rotation_velocity_by_segment.json`);
