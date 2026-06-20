/**
 * Lab study: runaway (EHI spikes) vs attention/comfort proxies (RSI band).
 *
 *   npx tsx scripts/research-rotation-comfort-boundary.mjs
 *
 * KPI (NRAB): production config in Non-Runaway Attention Band
 *   rotation_spike_count = 0
 *   RSI ≥ 1.0
 *   step0ShowcaseMeanYawRate ∈ [2.0, 4.5] °/s
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "experiments", "outputs", "rotation_comfort_boundary");

const YAW_SWEET_MIN = 2.0;
const YAW_SWEET_MAX = 4.5;
const SPIKE_CAP_DEG_PER_SEC = 120;
const ENTRANCE_STEP0_SHOWCASE_SEC = 3.5;
const RETREAT_HANDOFF_SEC = (2800 + 1600) / 1000;

mkdirSync(outDir, { recursive: true });

function measureWithEnv(envExtra = {}) {
  const env = { ...process.env };
  delete env.RESEARCH_ENTRANCE_SHOWCASE_SPIN;
  delete env.RESEARCH_ENTRANCE_RETREAT_HANDOFF_REVS;
  delete env.RESEARCH_FORCE_WEDDING_REVS;
  Object.assign(env, {
    EHI_PROFILE: "entrance_processional",
    EHI_ROTATION: "yaw_cw",
    ...envExtra,
  });
  const result = spawnSync(
    "npx",
    ["tsx", "scripts/measure-entrance-ehi.mjs", "--metrics-only"],
    {
      cwd: root,
      encoding: "utf8",
      shell: process.platform === "win32",
      env,
    }
  );
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout);
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

function computeRsi(metrics) {
  const V = velocityScore(metrics.step0ShowcaseMeanYawRateDegPerSec);
  const D = Math.min(1, metrics.step0YawCoherence / 0.85);
  const J =
    metrics.step0YawRateStdDegPerSec <= 1.2
      ? 1
      : Math.max(0, 1 - (metrics.step0YawRateStdDegPerSec - 1.2) / 2);
  const F = metrics.rotationSpikeCount === 0 ? 1 : 0;
  return {
    V_score: Number(V.toFixed(4)),
    D_score: Number(D.toFixed(4)),
    J_score: Number(J.toFixed(4)),
    F_score: F,
    RSI: Number((V * D * J * F).toFixed(4)),
  };
}

function inNrab(metrics, rsi) {
  return (
    metrics.rotationSpikeCount === 0 &&
    rsi.RSI >= 1.0 &&
    metrics.step0ShowcaseMeanYawRateDegPerSec >= YAW_SWEET_MIN &&
    metrics.step0ShowcaseMeanYawRateDegPerSec <= YAW_SWEET_MAX
  );
}

function showcaseSpinToYawRateDegPerSec(showcaseSpinRevs) {
  return (showcaseSpinRevs * 360) / ENTRANCE_STEP0_SHOWCASE_SEC;
}

function yawRateToShowcaseSpin(yawDegPerSec) {
  return (yawDegPerSec * ENTRANCE_STEP0_SHOWCASE_SEC) / 360;
}

function retreatRevsToPeakDegPerSec(retreatRevs) {
  return (retreatRevs * 360) / RETREAT_HANDOFF_SEC;
}

function sweepShowcaseSpin() {
  const values = [0, 0.01, 0.015, 0.02, 0.025, 0.03, 0.035, 0.04, 0.045, 0.05, 0.06, 0.08];
  return values.map((showcaseSpin) => {
    const row = measureWithEnv({
      RESEARCH_ENTRANCE_SHOWCASE_SPIN: String(showcaseSpin),
      RESEARCH_ENTRANCE_RETREAT_HANDOFF_REVS: "1.25",
    });
    const rsi = computeRsi(row.metrics);
    return {
      variable: "RESEARCH_ENTRANCE_SHOWCASE_SPIN",
      showcaseSpinRevs: showcaseSpin,
      predictedYawRateDegPerSec: Number(showcaseSpinToYawRateDegPerSec(showcaseSpin).toFixed(3)),
      metrics: row.metrics,
      rsi,
      inNrab: inNrab(row.metrics, rsi),
      EHI: row.scores.EHI,
    };
  });
}

function sweepRetreatHandoff() {
  const values = [0.6, 0.8, 1.0, 1.25, 1.35, 1.47, 1.6, 1.8, 2.0, 2.4];
  return values.map((retreatRevs) => {
    const row = measureWithEnv({
      RESEARCH_ENTRANCE_SHOWCASE_SPIN: "0.03",
      RESEARCH_ENTRANCE_RETREAT_HANDOFF_REVS: String(retreatRevs),
    });
    const rsi = computeRsi(row.metrics);
    return {
      variable: "RESEARCH_ENTRANCE_RETREAT_HANDOFF_REVS",
      retreatHandoffRevs: retreatRevs,
      predictedPeakDegPerSec: Number(retreatRevsToPeakDegPerSec(retreatRevs).toFixed(1)),
      metrics: row.metrics,
      rsi,
      inNrab: inNrab(row.metrics, rsi),
      EHI: row.scores.EHI,
    };
  });
}

function measureLegacyRunaway() {
  const weddingMixed = measureWithEnv({
    EHI_PROFILE: "wedding_default",
    EHI_ROTATION: "mixed",
  });
  const preFixEntrance = measureWithEnv({
    RESEARCH_FORCE_WEDDING_REVS: "1",
  });
  const rsiW = computeRsi(weddingMixed.metrics);
  const rsiP = computeRsi(preFixEntrance.metrics);
  return {
    weddingDefaultMixed: {
      label: "wedding_default + mixed (2-rev approach easeOutQuart)",
      metrics: weddingMixed.metrics,
      rsi: rsiW,
      inNrab: inNrab(weddingMixed.metrics, rsiW),
      EHI: weddingMixed.scores.EHI,
    },
    preFixEntranceYaw: {
      label: "entrance_processional + yaw_cw + wedding rev profile (pre-fix regression)",
      metrics: preFixEntrance.metrics,
      rsi: rsiP,
      inNrab: inNrab(preFixEntrance.metrics, rsiP),
      EHI: preFixEntrance.scores.EHI,
    },
  };
}

function measureProduction() {
  const row = measureWithEnv({});
  const rsi = computeRsi(row.metrics);
  return {
    label: "production entrance_processional + yaw_cw",
    showcaseSpinRevs: 0.03,
    retreatHandoffRevs: 1.25,
    metrics: row.metrics,
    rsi,
    inNrab: inNrab(row.metrics, rsi),
    EHI: row.scores.EHI,
  };
}

const production = measureProduction();
const legacy = measureLegacyRunaway();
const showcaseSweep = sweepShowcaseSpin();
const retreatSweep = sweepRetreatHandoff();

const nrabShowcase = showcaseSweep.filter((r) => r.inNrab);
const nrabRetreat = retreatSweep.filter((r) => r.inNrab);

const firstSpikeShowcase = showcaseSweep.find((r) => r.metrics.rotationSpikeCount > 0);
const firstSpikeRetreat = retreatSweep.find((r) => r.metrics.rotationSpikeCount > 0);

const report = {
  generatedAt: new Date().toISOString(),
  studyId: "rotation-comfort-boundary-2026",
  primaryKpi: {
    name: "NRAB (Non-Runaway Attention Band membership)",
    definition:
      "rotation_spike_count=0 AND RSI≥1.0 AND step0ShowcaseMeanYawRate∈[2.0,4.5]°/s",
    target: "production config ∈ NRAB",
    theoreticalBest: {
      showcaseSpinRevsRange: [
        Number(yawRateToShowcaseSpin(YAW_SWEET_MIN).toFixed(4)),
        Number(yawRateToShowcaseSpin(YAW_SWEET_MAX).toFixed(4)),
      ],
      note: "Max showcase spin at spike=0 with retreat fixed; human beauty unbounded in lab",
    },
  },
  runawayDefinition: {
    labSpikeRule: "eulerDist>12° OR degPerSec>120 between consecutive 30fps frames",
    retreatLinearCapDegPerSec: SPIKE_CAP_DEG_PER_SEC,
    retreatLinearCapRevs: Number(
      ((SPIKE_CAP_DEG_PER_SEC / 360) * RETREAT_HANDOFF_SEC).toFixed(3)
    ),
  },
  attentionComfortProxies: {
    RSI_yawSweetBandDegPerSec: [YAW_SWEET_MIN, YAW_SWEET_MAX],
    EHI_C_yawBandDegPerSec: [1.5, 5.0],
    FQI: "2D frame polish only — run npm run measure:cube-frame-fqi:gate",
    humanTier3: "Guest GSI field A/B — docs/field-ab-entrance-hologram.md (not measured here)",
  },
  production,
  legacyRunawayBaseline: legacy,
  showcaseSpinSweep: showcaseSweep,
  retreatHandoffSweep: retreatSweep,
  synthesis: {
    productionInNrab: production.inNrab,
    nrabShowcaseSpinRevsRange:
      nrabShowcase.length > 0
        ? [
            nrabShowcase[0].showcaseSpinRevs,
            nrabShowcase[nrabShowcase.length - 1].showcaseSpinRevs,
          ]
        : null,
    nrabRetreatHandoffRevsRange:
      nrabRetreat.length > 0
        ? [
            nrabRetreat[0].retreatHandoffRevs,
            nrabRetreat[nrabRetreat.length - 1].retreatHandoffRevs,
          ]
        : null,
    firstSpikeOnShowcaseSweep: firstSpikeShowcase ?? null,
    firstSpikeOnRetreatSweep: firstSpikeRetreat ?? null,
    legacySpikeCount: legacy.preFixEntranceYaw.metrics.rotationSpikeCount,
    legacyWeddingMixedSpikeCount: legacy.weddingDefaultMixed.metrics.rotationSpikeCount,
  },
};

writeFileSync(join(outDir, "analysis.json"), JSON.stringify(report, null, 2));

const tex = `% Auto-generated rotation comfort boundary study
\\section{Rotation comfort boundary (lab)}
\\textbf{Primary KPI:} NRAB membership for production config.

\\subsection{Runaway (lab proxy)}
Spike if frame-to-frame $\\Delta\\theta>12^\\circ$ or $\\dot\\theta>120^\\circ/\\mathrm{s}$.
Legacy wedding\\_default+mixed: ${legacy.weddingDefaultMixed.metrics.rotationSpikeCount} spikes.
Pre-fix entrance+yaw wedding revs: ${legacy.preFixEntranceYaw.metrics.rotationSpikeCount} spikes.

\\subsection{Attention (lab proxy)}
RSI sweet band: step0 showcase $|\\dot\\psi| \\in [${YAW_SWEET_MIN}, ${YAW_SWEET_MAX}]^\\circ/\\mathrm{s}$.

\\subsection{Production}
showcaseSpin=${production.showcaseSpinRevs} rev, retreat=${production.retreatHandoffRevs} rev,
step0 yaw=${production.metrics.step0ShowcaseMeanYawRateDegPerSec}$^\\circ/\\mathrm{s}$,
spikes=${production.metrics.rotationSpikeCount}, RSI=${production.rsi.RSI},
NRAB=${production.inNrab ? "PASS" : "FAIL"}.

\\subsection{Human aesthetics}
FQI = frame shader polish; GSI = field guest satisfaction --- Tier 3 not run in this script.
`;
writeFileSync(join(outDir, "report.tex"), tex);

console.log("\n=== Rotation comfort boundary study ===\n");
console.log(
  `Production NRAB: ${production.inNrab ? "PASS" : "FAIL"} ` +
    `(spikes=${production.metrics.rotationSpikeCount}, ` +
    `step0_yaw=${production.metrics.step0ShowcaseMeanYawRateDegPerSec}°/s, RSI=${production.rsi.RSI})`
);
console.log(
  `Legacy wedding_default+mixed: spikes=${legacy.weddingDefaultMixed.metrics.rotationSpikeCount}, ` +
    `step0_yaw=${legacy.weddingDefaultMixed.metrics.step0ShowcaseMeanYawRateDegPerSec}°/s`
);
console.log(
  `Pre-fix entrance+yaw (wedding revs): spikes=${legacy.preFixEntranceYaw.metrics.rotationSpikeCount}, ` +
    `step0_yaw=${legacy.preFixEntranceYaw.metrics.step0ShowcaseMeanYawRateDegPerSec}°/s`
);
if (nrabShowcase.length > 0) {
  console.log(
    `NRAB showcase spin revs (retreat=1.25): ` +
      `[${nrabShowcase[0].showcaseSpinRevs}, ${nrabShowcase[nrabShowcase.length - 1].showcaseSpinRevs}]`
  );
}
if (firstSpikeRetreat) {
  console.log(
    `First retreat sweep spike at ${firstSpikeRetreat.retreatHandoffRevs} rev ` +
      `(~${firstSpikeRetreat.predictedPeakDegPerSec}°/s linear peak)`
  );
}
console.log(`\nWrote ${join(outDir, "analysis.json")}\n`);

process.exit(production.inNrab ? 0 : 1);
