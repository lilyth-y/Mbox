/**
 * Rotation Satisfaction Index (RSI) — visual comfort for cube spin direction/speed.
 *   npx tsx scripts/measure-rotation-satisfaction.mjs --sweep
 *   npx tsx scripts/measure-rotation-satisfaction.mjs --gate
 *
 * RSI = V_score × D_score × J_score × F_score
 *   V: showcase mean |yaw rate| in sweet band [2.0, 4.5] °/s
 *   D: direction coherence (same-sign yaw deltas) ≥ 0.85
 *   J: showcase yaw-rate stddev ≤ 1.2 °/s
 *   F: rotation_spike_count === 0
 *
 * Target: RSI ≥ 1.0 on production rotation mode (default yaw_cw).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "experiments", "outputs", "entrance_ehi");

/** Comfortable visual tracking band (tighter than EHI C_score). */
export const YAW_SWEET_MIN = 2.0;
export const YAW_SWEET_MAX = 4.5;
export const DIRECTION_COHERENCE_TARGET = 0.85;
export const YAW_RATE_STDDEV_MAX = 1.2;
export const RSI_TARGET = 1.0;

const SWEEP_MODES = [
  "yaw_cw",
  "yaw_ccw",
  "mixed",
  "auto",
  "pitch_up",
  "pitch_down",
  "roll",
  "corner_swing",
];

const PRODUCTION_MODE = process.env.RSI_PRODUCTION_MODE ?? "yaw_cw";

function runMeasure(mode) {
  const result = spawnSync(
    "npx",
    ["tsx", "scripts/measure-entrance-ehi.mjs", "--metrics-only"],
    {
      cwd: root,
      encoding: "utf8",
      shell: process.platform === "win32",
      env: {
        ...process.env,
        EHI_PROFILE: "entrance_processional",
        EHI_ROTATION: mode,
      },
    }
  );
  if (result.status !== 0) {
    throw new Error(`measure failed for ${mode}: ${result.stderr || result.stdout}`);
  }
  return JSON.parse(result.stdout.trim());
}

function velocityScore(meanYawRate) {
  if (meanYawRate >= YAW_SWEET_MIN && meanYawRate <= YAW_SWEET_MAX) {
    return 1;
  }
  if (meanYawRate < YAW_SWEET_MIN) {
    return Math.max(0, meanYawRate / YAW_SWEET_MIN);
  }
  return Math.max(0, YAW_SWEET_MAX / meanYawRate);
}

function directionScore(coherence) {
  return Math.min(1, coherence / DIRECTION_COHERENCE_TARGET);
}

function jerkScore(stddev) {
  if (stddev <= YAW_RATE_STDDEV_MAX) {
    return 1;
  }
  return Math.max(0, 1 - (stddev - YAW_RATE_STDDEV_MAX) / 2);
}

function spikeScore(spikeCount) {
  return spikeCount === 0 ? 1 : 0;
}

function computeRsi(metrics) {
  /** Entrance hero (step0) drives visual direction/speed satisfaction. */
  const V_score = velocityScore(metrics.step0ShowcaseMeanYawRateDegPerSec);
  const D_score = directionScore(metrics.step0YawCoherence);
  const J_score = jerkScore(metrics.step0YawRateStdDegPerSec);
  const F_score = spikeScore(metrics.rotationSpikeCount);
  const RSI = V_score * D_score * J_score * F_score;
  const pass = RSI >= RSI_TARGET;
  return {
    V_score: Number(V_score.toFixed(4)),
    D_score: Number(D_score.toFixed(4)),
    J_score: Number(J_score.toFixed(4)),
    F_score,
    RSI: Number(RSI.toFixed(4)),
    pass,
    result: pass ? "PASS" : "FAIL",
  };
}

function buildReport(mode, raw) {
  const scores = computeRsi(raw.metrics);
  return {
    rotationMode: mode,
    metrics: raw.metrics,
    scores: { ...scores, EHI: raw.scores.EHI },
    ehiPass: raw.pass,
  };
}

mkdirSync(outDir, { recursive: true });

const runSweep = process.argv.includes("--sweep");
const runGate = process.argv.includes("--gate");

if (runSweep) {
  const sweep = SWEEP_MODES.map((mode) => {
    console.log(`Measuring rotation mode: ${mode}`);
    const raw = runMeasure(mode);
    return buildReport(mode, raw);
  });

  sweep.sort((a, b) => b.scores.RSI - a.scores.RSI);
  const best = sweep[0];
  const report = {
    generatedAt: new Date().toISOString(),
    kpi: "Rotation Satisfaction Index (RSI)",
    target: RSI_TARGET,
    formula: "RSI = V × D × J × F",
    thresholds: {
      yawSweetBand: [YAW_SWEET_MIN, YAW_SWEET_MAX],
      directionCoherence: DIRECTION_COHERENCE_TARGET,
      yawRateStdMax: YAW_RATE_STDDEV_MAX,
    },
    recommendedMode: best.rotationMode,
    sweep,
  };
  writeFileSync(join(outDir, "rotation_sweep.json"), JSON.stringify(report, null, 2));

  console.log("\n=== Rotation mode sweep (RSI) ===\n");
  for (const row of sweep) {
    console.log(
      `${row.rotationMode.padEnd(14)} RSI=${row.scores.RSI} ` +
        `V=${row.scores.V_score} D=${row.scores.D_score} J=${row.scores.J_score} F=${row.scores.F_score} ` +
      `step0_yaw=${row.metrics.step0ShowcaseMeanYawRateDegPerSec}°/s coherence=${row.metrics.step0YawCoherence} ` +
      `step0_std=${row.metrics.step0YawRateStdDegPerSec} spikes=${row.metrics.rotationSpikeCount} ` +
        `EHI=${row.scores.EHI} → ${row.scores.result}`
    );
  }
  console.log(`\nRecommended: ${best.rotationMode}`);
  console.log(`Wrote ${join(outDir, "rotation_sweep.json")}`);
  process.exit(0);
}

if (runGate) {
  const raw = runMeasure(PRODUCTION_MODE);
  const row = buildReport(PRODUCTION_MODE, raw);
  const ehiGate = spawnSync("npx", ["tsx", "scripts/measure-entrance-ehi.mjs", "--gate"], {
    cwd: root,
    encoding: "utf8",
    shell: process.platform === "win32",
    env: { ...process.env, EHI_ROTATION: PRODUCTION_MODE },
  });
  const ehiPass = ehiGate.status === 0;
  const report = {
    generatedAt: new Date().toISOString(),
    productionMode: PRODUCTION_MODE,
    ...row,
  };
  writeFileSync(join(outDir, "rotation_gate.json"), JSON.stringify(report, null, 2));

  console.log("\n=== Rotation Satisfaction Gate ===\n");
  console.log(
    `Mode: ${PRODUCTION_MODE}\n` +
      `KPI:      RSI\n` +
      `Target:   ${RSI_TARGET}\n` +
      `Measured: ${row.scores.RSI}\n` +
      `Result:   ${row.scores.result}\n` +
      `V=${row.scores.V_score} D=${row.scores.D_score} J=${row.scores.J_score} F=${row.scores.F_score}\n` +
      `step0_yaw=${row.metrics.step0ShowcaseMeanYawRateDegPerSec}°/s coherence=${row.metrics.step0YawCoherence} ` +
      `step0_std=${row.metrics.step0YawRateStdDegPerSec} spikes=${row.metrics.rotationSpikeCount}\n` +
      `EHI=${row.scores.EHI} (${row.ehiPass ? "PASS" : "FAIL"})\n`
  );
  process.exit(row.scores.pass && ehiPass ? 0 : 1);
}

console.error("Usage: --sweep | --gate");
process.exit(1);
