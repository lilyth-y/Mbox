/**
 * Entrance Hologram Index (EHI) — measurable KPI for wedding entrance MP4.
 *   npx tsx scripts/measure-entrance-ehi.mjs
 *   npx tsx scripts/measure-entrance-ehi.mjs --all-attempts
 *
 * Env overrides (single run):
 *   EHI_PROFILE=entrance_processional|wedding_default
 *   EHI_ROTATION=mixed|yaw_cw
 *   EHI_PARALLAX_MUL=0.5
 *   EHI_FOCUS_PULSE_MUL=0.35
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import {
  getFanStepSegmentMs,
  resolveFanPhase,
  sampleFanCubeMotion,
} from "../apps/web/src/features/cube/cubeFanTimeline.ts";
import {
  getLoopBridgeMs,
  resolvePresentationTimeline,
  sumSegmentDurations,
} from "../apps/web/src/features/cube/cubeMotionVariety.ts";
import { getPresentationFace } from "../apps/web/src/features/cube/cubeSequence.ts";
import { applyExportPresentationOverrides } from "../apps/web/src/features/cube/presentationExport.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "experiments", "outputs", "entrance_ehi");

const FPS = 30;
const FRAME_MS = 1000 / FPS;
const PRESENTATION_COUNT = Number(process.env.EHI_STEPS ?? 3);
const MOTION_SEED = Number(process.env.EHI_SEED ?? 42);
const ROTATION_MODE_DEFAULT = process.env.EHI_ROTATION ?? "mixed";
const PROFILE = process.env.EHI_PROFILE ?? "entrance_processional";
const HOLOGRAM_MODE = process.env.EHI_HOLOGRAM !== "false";
const PARALLAX_TARGET = 0.035;
const YAW_RATE_MIN = 1.5;
const YAW_RATE_MAX = 5.0;
const SPIKE_DEG_THRESHOLD = 12;
const SPIKE_DEG_PER_SEC = 120;

const ATTEMPT_PRESETS = [
  {
    attempt: 1,
    label: "baseline wedding_default",
    profile: "wedding_default",
    hologramMode: true,
    parallaxMul: 0.22,
    focusPulseMul: 0,
    retreatSpinMax: 0.55,
    handoffSpin: 0,
  },
  {
    attempt: 2,
    label: "hologram export parallax 0.50",
    profile: "wedding_default",
    hologramMode: true,
    parallaxMul: 0.5,
    focusPulseMul: 0,
    retreatSpinMax: 0.55,
    handoffSpin: 0,
  },
  {
    attempt: 3,
    label: "+ export focusPulse 35%",
    profile: "wedding_default",
    hologramMode: true,
    parallaxMul: 0.5,
    focusPulseMul: 0.35,
    retreatSpinMax: 0.55,
    handoffSpin: 0,
  },
  {
    attempt: 4,
    label: "entrance_processional profile",
    profile: "entrance_processional",
    hologramMode: true,
    parallaxMul: 0.5,
    focusPulseMul: 0.35,
    retreatSpinMax: 0.55,
    handoffSpin: 0,
  },
  {
    attempt: 5,
    label: "retreat spin cap 0.18 + gated spin",
    profile: "entrance_processional",
    hologramMode: true,
    parallaxMul: 0.5,
    focusPulseMul: 0.35,
  },
  {
    attempt: 6,
    label: "final production config",
    profile: "entrance_processional",
    hologramMode: true,
    parallaxMul: 0.5,
    focusPulseMul: 0.35,
  },
];

function eulerDist(a, b) {
  const dq = new THREE.Quaternion().setFromEuler(a);
  const qq = new THREE.Quaternion().setFromEuler(b);
  const dot = Math.min(1, Math.abs(dq.dot(qq)));
  return (2 * Math.acos(dot) * 180) / Math.PI;
}

function applyExportWithOverrides(frame, config) {
  if (config.parallaxMul != null || config.focusPulseMul != null) {
    const parallaxMul = config.parallaxMul ?? (config.hologramMode ? 0.5 : 0.22);
    const focusPulseMul = config.focusPulseMul ?? (config.hologramMode ? 0.35 : 0);
    return {
      ...frame,
      parallaxAmount: frame.parallaxAmount * parallaxMul,
      focusPulse: (frame.focusPulse ?? 0) * focusPulseMul,
    };
  }
  return applyExportPresentationOverrides(frame, { hologramMode: config.hologramMode });
}

function sampleMotion(step, stepElapsed, profile, rotationMode = process.env.EHI_ROTATION ?? ROTATION_MODE_DEFAULT) {
  const face = getPresentationFace(step);
  return sampleFanCubeMotion(
    step,
    stepElapsed,
    face,
    PRESENTATION_COUNT,
    MOTION_SEED,
    rotationMode,
    profile
  );
}

function measureConfig(config) {
  const profile = config.profile ?? PROFILE;
  const rotationMode = config.rotationMode ?? process.env.EHI_ROTATION ?? ROTATION_MODE_DEFAULT;
  const segmentMs = Array.from({ length: PRESENTATION_COUNT }, (_, s) =>
    getFanStepSegmentMs(s, profile)
  );
  const loopBridgeMs = getLoopBridgeMs("cube_focus", PRESENTATION_COUNT);
  const cycleMs = sumSegmentDurations(segmentMs) + loopBridgeMs;

  const frames = [];
  for (let t = 0; t < cycleMs; t += FRAME_MS) {
    const resolved = resolvePresentationTimeline(Math.round(t), segmentMs, loopBridgeMs);
    if (resolved.kind === "loop_bridge") continue;

    const { step, stepElapsed } = resolved;
    const phaseState = resolveFanPhase(step, stepElapsed, profile);
    const motion = sampleMotion(step, stepElapsed, profile, rotationMode);

    const previewFrame = {
      parallaxAmount: motion.parallaxAmount,
      focusPulse: motion.focusPulse,
      rotation: motion.rotation.clone(),
    };
    const exportFrame = applyExportWithOverrides(
      {
        cameraZ: 5,
        fieldOfView: 88,
        parallaxAmount: previewFrame.parallaxAmount,
        focusPulse: previewFrame.focusPulse,
        applyRootTransform: () => {},
      },
      config
    );

    frames.push({
      globalMs: Math.round(t),
      step,
      phase: phaseState.phase,
      exportParallax: exportFrame.parallaxAmount,
      exportFocusPulse: exportFrame.focusPulse ?? 0,
      rotYDeg: (motion.rotation.y * 180) / Math.PI,
      euler: motion.rotation.clone(),
    });
  }

  const showcaseFrames = frames.filter((f) => f.phase === "showcase_hold");
  const exportShowcaseParallaxMean =
    showcaseFrames.reduce((sum, f) => sum + f.exportParallax, 0) /
    Math.max(1, showcaseFrames.length);

  const spikes = [];
  for (let i = 1; i < frames.length; i += 1) {
    const prev = frames[i - 1];
    const cur = frames[i];
    const dDeg = eulerDist(prev.euler, cur.euler);
    const dt = (cur.globalMs - prev.globalMs) / 1000;
    const degPerSec = dDeg / dt;
    if (dDeg > SPIKE_DEG_THRESHOLD || degPerSec > SPIKE_DEG_PER_SEC) {
      spikes.push({ ms: cur.globalMs, step: cur.step, phase: cur.phase, dDeg, degPerSec });
    }
  }

  function yawStatsForStepFrames(stepFrames) {
    const yawRates = [];
    const yawDeltas = [];
    for (let i = 1; i < stepFrames.length; i += 1) {
      const prev = stepFrames[i - 1];
      const cur = stepFrames[i];
      const dYaw = cur.rotYDeg - prev.rotYDeg;
      const dt = (cur.globalMs - prev.globalMs) / 1000;
      yawRates.push(Math.abs(dYaw) / dt);
      yawDeltas.push(dYaw);
    }
    const mean =
      yawRates.length > 0 ? yawRates.reduce((a, b) => a + b, 0) / yawRates.length : 0;
    const std =
      yawRates.length > 1
        ? Math.sqrt(
            yawRates.reduce((sum, r) => sum + (r - mean) ** 2, 0) / yawRates.length
          )
        : 0;
    let coherence = 1;
    if (yawDeltas.length > 0) {
      const pos = yawDeltas.filter((d) => d > 0.02).length;
      const neg = yawDeltas.filter((d) => d < -0.02).length;
      const neutral = yawDeltas.length - pos - neg;
      const dominant = Math.max(pos, neg);
      coherence = (dominant + neutral * 0.5) / yawDeltas.length;
    }
    return { mean, std, coherence };
  }

  const perStepStats = [];
  for (let step = 0; step < PRESENTATION_COUNT; step += 1) {
    const stepFrames = showcaseFrames.filter((f) => f.step === step);
    perStepStats.push({ step, ...yawStatsForStepFrames(stepFrames) });
  }

  const allStepMean = perStepStats.map((s) => s.mean);
  const showcaseMeanYawRate =
    allStepMean.length > 0 ? allStepMean.reduce((a, b) => a + b, 0) / allStepMean.length : 0;
  const showcaseYawRateStd = Math.max(...perStepStats.map((s) => s.std), 0);
  const showcaseYawCoherence =
    perStepStats.length > 0
      ? perStepStats.reduce((a, s) => a + s.coherence, 0) / perStepStats.length
      : 1;

  const step0Stats = perStepStats.find((s) => s.step === 0) ?? { mean: 0, std: 0, coherence: 1 };
  const step0MeanYawRate = step0Stats.mean;
  const step0YawRateStd = step0Stats.std;
  const step0YawCoherence = step0Stats.coherence;

  const D_score = exportShowcaseParallaxMean / PARALLAX_TARGET;
  const S_score = Math.max(0, 1 - spikes.length / 3);
  const comfortYawRate =
    profile === "entrance_processional" ? step0MeanYawRate : showcaseMeanYawRate;
  const C_score =
    comfortYawRate >= YAW_RATE_MIN && comfortYawRate <= YAW_RATE_MAX ? 1 : 0.5;
  const EHI = D_score * S_score * C_score;
  const pass = EHI >= 1.0;

  return {
    attempt: config.attempt,
    label: config.label,
    profile,
    config,
    metrics: {
      exportShowcaseParallaxMean: Number(exportShowcaseParallaxMean.toFixed(5)),
      showcaseMeanYawRateDegPerSec: Number(showcaseMeanYawRate.toFixed(3)),
      showcaseYawRateStdDegPerSec: Number(showcaseYawRateStd.toFixed(3)),
      showcaseYawCoherence: Number(showcaseYawCoherence.toFixed(4)),
      step0ShowcaseMeanYawRateDegPerSec: Number(step0MeanYawRate.toFixed(3)),
      step0YawRateStdDegPerSec: Number(step0YawRateStd.toFixed(3)),
      step0YawCoherence: Number(step0YawCoherence.toFixed(4)),
      rotationSpikeCount: spikes.length,
      showcaseFrameCount: showcaseFrames.length,
      cycleSec: Number((cycleMs / 1000).toFixed(2)),
      rotationMode,
    },
    scores: {
      D_score: Number(D_score.toFixed(4)),
      S_score: Number(S_score.toFixed(4)),
      C_score,
      EHI: Number(EHI.toFixed(4)),
    },
    spikes: spikes.slice(0, 10),
    pass,
    result: pass ? "PASS" : "FAIL",
  };
}

function runSingleFromEnv() {
  const parallaxMul = process.env.EHI_PARALLAX_MUL
    ? Number(process.env.EHI_PARALLAX_MUL)
    : undefined;
  const focusPulseMul = process.env.EHI_FOCUS_PULSE_MUL
    ? Number(process.env.EHI_FOCUS_PULSE_MUL)
    : undefined;

  return measureConfig({
    attempt: 0,
    label: "env override run",
    profile: PROFILE,
    rotationMode: ROTATION_MODE_DEFAULT,
    hologramMode: HOLOGRAM_MODE,
    parallaxMul: parallaxMul ?? 0.5,
    focusPulseMul: focusPulseMul ?? 0.35,
  });
}

const FIELD_AB_CONDITIONS = [
  {
    id: "A",
    label: "field A control (wedding_default)",
    profile: "wedding_default",
    parallaxMul: 0.22,
    focusPulseMul: 0,
  },
  {
    id: "B",
    label: "field B treatment (entrance_processional)",
    profile: "entrance_processional",
    parallaxMul: 0.5,
    focusPulseMul: 0.35,
  },
];

function computeRsiProxy(metrics) {
  const meanYaw = metrics.step0ShowcaseMeanYawRateDegPerSec;
  const V_score =
    meanYaw >= 2.0 && meanYaw <= 4.5
      ? 1
      : meanYaw < 2.0
        ? Math.max(0, meanYaw / 2.0)
        : Math.max(0, 4.5 / meanYaw);
  const D_score = Math.min(1, metrics.step0YawCoherence / 0.85);
  const J_score =
    metrics.step0YawRateStdDegPerSec <= 1.2
      ? 1
      : Math.max(0, 1 - (metrics.step0YawRateStdDegPerSec - 1.2) / 2);
  const F_score = metrics.rotationSpikeCount === 0 ? 1 : 0;
  const RSI = V_score * D_score * J_score * F_score;
  return {
    V_score: Number(V_score.toFixed(4)),
    D_score: Number(D_score.toFixed(4)),
    J_score: Number(J_score.toFixed(4)),
    F_score,
    RSI: Number(RSI.toFixed(4)),
  };
}

function runFieldAbProxy() {
  return FIELD_AB_CONDITIONS.map((condition, index) => {
    const measured = measureConfig({
      attempt: index + 1,
      label: condition.label,
      profile: condition.profile,
      rotationMode: "yaw_cw",
      hologramMode: true,
      parallaxMul: condition.parallaxMul,
      focusPulseMul: condition.focusPulseMul,
    });
    return {
      condition: condition.id,
      playback: {
        fanProfile: condition.profile,
        exportParallaxMul: condition.parallaxMul,
        exportFocusPulseMul: condition.focusPulseMul,
        rotationMode: "yaw_cw",
      },
      metrics: measured.metrics,
      scores: measured.scores,
      rsi: computeRsiProxy(measured.metrics),
      pass: measured.pass,
      result: measured.result,
    };
  });
}

function runProductionGate() {
  return measureConfig({
    attempt: 6,
    label: "production gate",
    profile: "entrance_processional",
    rotationMode: "yaw_cw",
    hologramMode: true,
    parallaxMul: 0.5,
    focusPulseMul: 0.35,
  });
}

mkdirSync(outDir, { recursive: true });

if (process.argv.includes("--field-ab")) {
  const fieldOutDir = join(root, "experiments", "outputs", "field_ab");
  mkdirSync(fieldOutDir, { recursive: true });
  const conditions = runFieldAbProxy();
  const rowA = conditions.find((row) => row.condition === "A");
  const rowB = conditions.find((row) => row.condition === "B");
  const report = {
    generatedAt: new Date().toISOString(),
    studyId: "entrance-hologram-field-ab-2026",
    kpiProxy: {
      EHI: "Entrance Hologram Index",
      RSI: "Rotation Satisfaction Index (step0, yaw_cw)",
    },
    conditions,
    comparison: {
      deltaEHI: Number((rowB.scores.EHI - rowA.scores.EHI).toFixed(4)),
      deltaRSI: Number((rowB.rsi.RSI - rowA.rsi.RSI).toFixed(4)),
      B_passes_ehi_gate: rowB.pass,
      A_passes_ehi_gate: rowA.pass,
    },
  };
  writeFileSync(join(fieldOutDir, "ehi_proxy.json"), JSON.stringify(report, null, 2));
  console.log("\n=== Field A/B EHI proxy (lab) ===\n");
  for (const row of conditions) {
    console.log(
      `Condition ${row.condition}: EHI=${row.scores.EHI} RSI=${row.rsi.RSI} ` +
        `spikes=${row.metrics.rotationSpikeCount} step0_yaw=${row.metrics.step0ShowcaseMeanYawRateDegPerSec}°/s → ${row.result}`
    );
  }
  console.log(`\nΔEHI (B−A): ${report.comparison.deltaEHI}`);
  console.log(`Wrote ${join(fieldOutDir, "ehi_proxy.json")}\n`);
  process.exit(0);
}

const runGate = process.argv.includes("--gate");
const runMetricsOnly = process.argv.includes("--metrics-only");
const runAll = process.argv.includes("--all-attempts");
const results = runGate
  ? [runProductionGate()]
  : runMetricsOnly
    ? [runSingleFromEnv()]
    : runAll
      ? ATTEMPT_PRESETS.map((preset) => measureConfig(preset))
      : [runSingleFromEnv()];

const finalResult = results[results.length - 1];
const report = {
  generatedAt: new Date().toISOString(),
  kpi: "Entrance Hologram Index (EHI)",
  target: 1.0,
  theoreticalBest: 1.7,
  measurement: {
    fps: FPS,
    steps: PRESENTATION_COUNT,
    seed: MOTION_SEED,
    rotationMode: results[0]?.config?.rotationMode ?? ROTATION_MODE_DEFAULT,
  },
  attempts: results,
  summary: {
    finalAttempt: finalResult.attempt,
    finalEHI: finalResult.scores.EHI,
    finalResult: finalResult.result,
    gapToTarget: Number((1.0 - finalResult.scores.EHI).toFixed(4)),
    gapToTheoreticalBest: Number((1.7 - finalResult.scores.EHI).toFixed(4)),
  },
};

writeFileSync(join(outDir, "attempt_log.json"), JSON.stringify(report, null, 2));

if (runMetricsOnly) {
  const row = results[0];
  process.stdout.write(
    JSON.stringify({
      metrics: row.metrics,
      scores: row.scores,
      pass: row.pass,
      rotationMode: row.metrics.rotationMode,
    })
  );
  process.exit(0);
}

console.log("\n=== Entrance Hologram Index (EHI) ===\n");
for (const r of results) {
  console.log(
    `Attempt ${r.attempt ?? "-"}: ${r.label}\n` +
      `  KPI:      EHI\n` +
      `  Target:   1.0\n` +
      `  Measured: ${r.scores.EHI}\n` +
      `  Result:   ${r.result} (measured ${r.pass ? ">=" : "<"} target)\n` +
      `  Gap:      target ${(1.0 - r.scores.EHI).toFixed(4)}, theoretical best ${(1.7 - r.scores.EHI).toFixed(4)}\n` +
      `  D=${r.scores.D_score} S=${r.scores.S_score} C=${r.scores.C_score} ` +
      `parallax=${r.metrics.exportShowcaseParallaxMean} spikes=${r.metrics.rotationSpikeCount} yaw=${r.metrics.showcaseMeanYawRateDegPerSec}°/s\n`
  );
}

console.log(`Wrote ${join(outDir, "attempt_log.json")}`);

if (runGate) {
  const gate = results[0];
  console.log(
    `\nGATE: EHI=${gate.scores.EHI} spikes=${gate.metrics.rotationSpikeCount} → ${gate.result}\n`
  );
  process.exit(gate.pass ? 0 : 1);
}

process.exit(results.every((r) => r.pass) ? 0 : results[results.length - 1].pass ? 0 : 1);
