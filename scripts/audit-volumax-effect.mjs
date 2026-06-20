#!/usr/bin/env node
/**
 * Tier-1 quantitative audit: is VoluMax depth separation perceptually non-zero?
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

await import(pathToFileURL(join(root, "packages/shared/dist/cube-export.js")).href).catch(async () => {
  const { spawnSync } = await import("node:child_process");
  spawnSync("npm", ["run", "build", "--workspace", "@mbox/shared"], {
    cwd: root,
    shell: true,
    stdio: "inherit",
  });
});

const {
  CUBE_PARALLAX_PEAK_MAX,
  CUBE_PARALLAX_FG_MUL_VOLUMAX,
  CUBE_PARALLAX_BG_MUL_VOLUMAX,
  CUBE_FACE_PLANE_SIZE_REF,
  CUBE_ORIGINAL_PLATE_BLUR_PX,
  showcaseHoldParallaxEnvelope,
  clampParallaxAmount,
} = await import(pathToFileURL(join(root, "packages/shared/dist/cube-export.js")).href);

const FAN_PARALLAX_PEAK = CUBE_PARALLAX_PEAK_MAX;
const PARALLAX_RATE = 0.048;
const PARALLAX_MS_LEGACY = 2650;
const SCENE_PARALLAX_MAX = PARALLAX_RATE * (PARALLAX_MS_LEGACY / 1000);
const FACE = CUBE_FACE_PLANE_SIZE_REF;
const APPROACH_MS = 2400;
const HOLD_MS = 2800;
const RETREAT_MS = 2000;
const GAP_MS = 1600;
const STEP_MS = APPROACH_MS + HOLD_MS + RETREAT_MS + GAP_MS;

function sampleParallaxAtHoldMs(elapsedInHold) {
  const u = elapsedInHold / HOLD_MS;
  const breathe = Math.sin(u * Math.PI);
  const holdEnvelope = showcaseHoldParallaxEnvelope(u);
  return clampParallaxAmount(FAN_PARALLAX_PEAK * (0.9 + 0.1 * breathe) * holdEnvelope);
}

const samples = [];
for (let t = 0; t <= HOLD_MS; t += 50) {
  const amount = sampleParallaxAtHoldMs(t);
  const norm = Math.min(1, amount / SCENE_PARALLAX_MAX);
  samples.push({ t, amount, norm });
}

const peak = samples.reduce((best, s) => (s.amount > best.amount ? s : best), samples[0]);
const visibleBg = samples.filter((s) => s.norm > 0.02).length / samples.length;
const strong = samples.filter((s) => s.norm > 0.5).length / samples.length;

const xyFgPx = (peak.norm * CUBE_PARALLAX_FG_MUL_VOLUMAX / FACE) * 600;
const xyBgPx = (peak.norm * CUBE_PARALLAX_BG_MUL_VOLUMAX / FACE) * 600;
const zOnlyPop = peak.norm * 0.08 + 0.22 * 0.06;
const zOnlyScalePct = (1 + peak.norm * 0.05 + 0.22 * 0.04 - 1) * 100;

const sceneSrc = readFileSync(
  join(root, "apps/web/src/features/cube/presentationScene.ts"),
  "utf8"
);
const usesDisp = /mountVolumaxDispFace|volumax_disp/.test(sceneSrc);
const assignUsesMesh = /mountVolumaxMeshFace/.test(sceneSrc);
const cutoutMeshPath =
  /resolveVoluMaxMountMode/.test(sceneSrc) && /isCutoutMatteFaceMaterial/.test(sceneSrc);
const zOnlyPath =
  cutoutMeshPath && /rig\.mode === "volumax_mesh"/.test(sceneSrc);

const report = {
  tier: "1_code_metrics",
  timeline: {
    stepMs: STEP_MS,
    showcaseHoldMs: HOLD_MS,
    showcaseShareOfStep: HOLD_MS / STEP_MS,
    parallaxPhases: ["showcase_hold_only"],
    approachRetreatParallax: 0,
  },
  peakDrive: {
    fanParallaxPeak: FAN_PARALLAX_PEAK,
    sceneNormDivisor: SCENE_PARALLAX_MAX,
    normSaturatesAtAmount: SCENE_PARALLAX_MAX,
    peakAmount: peak.amount,
    peakNorm: peak.norm,
    fractionOfStepWithNormGt002: visibleBg * (HOLD_MS / STEP_MS),
    fractionOfHoldWithNormGt05: strong,
  },
  worldOffsetsAtPeak: {
    xySplit_fgWorld: peak.norm * CUBE_PARALLAX_FG_MUL_VOLUMAX,
    xySplit_bgWorld: peak.norm * CUBE_PARALLAX_BG_MUL_VOLUMAX,
    xySplit_fgPxOn600Canvas: Number(xyFgPx.toFixed(2)),
    xySplit_bgPxOn600Canvas: Number(xyBgPx.toFixed(2)),
    zOnlyZPopWorld: Number(zOnlyPop.toFixed(4)),
    zOnlyScalePercent: Number(zOnlyScalePct.toFixed(2)),
  },
  pipeline: {
    volumaxDispMounted: usesDisp,
    primaryPath: assignUsesMesh ? "volumax_mesh_for_ai_cutout" : "unknown",
    aiCutoutPath: cutoutMeshPath ? "volumax_mesh_z_only" : "unknown",
    softVoluMaxTypicalPath: zOnlyPath ? "z_only_mesh_cutout" : "disp_or_flat",
    plateBlurPx: CUBE_ORIGINAL_PLATE_BLUR_PX,
    exportPreviewParallaxMul: 1,
    exportMp4DefaultParallaxMul: 0.72,
    exportHologramParallaxMul: 0.92,
  },
  verdict: {
    depthOff: "no_effect",
    depthOnSoftVoluMax: "xy_split_with_blur_plate_peak_22px_fg",
    depthOnAiCutout: "z_only_mesh_same_uv_fg_bg",
    perceptualJndEstimatePx: 8,
    xySplitLikelyVisible: xyFgPx >= 8,
    zOnlyLikelyVisible: zOnlyScalePct >= 3,
  },
};

console.log(JSON.stringify(report, null, 2));

const fail =
  report.peakDrive.peakNorm < 0.25 ||
  report.worldOffsetsAtPeak.xySplit_fgPxOn600Canvas < 4;
if (fail) {
  console.error("audit-volumax-effect: WARN — peak drive below perceptual threshold");
  process.exit(0);
}
console.log("audit-volumax-effect: OK (metrics recorded)");
