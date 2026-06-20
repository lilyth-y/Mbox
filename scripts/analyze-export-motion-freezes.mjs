/**
 * Frame-level rotation freeze analysis — default showcase FX vs MP4 export path.
 *   npx tsx scripts/analyze-export-motion-freezes.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { DEFAULT_CUBE_SHOWCASE_FX } from "../packages/shared/src/cubeShowcaseFx.ts";
import {
  getFanApproachMs,
  getFanRetreatMs,
  getFanShowcaseHoldMs,
  FAN_GAP_MS,
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
import { getRevsWithinStep } from "../apps/web/src/features/cube/fanTransform.ts";
import { runWithFanMotionExportRecording } from "../apps/web/src/features/cube/fanExportRotation.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "experiments", "outputs", "export_motion_freezes");
const FPS = 30;
const FRAME_MS = 1000 / FPS;
const N_STEPS = 6;
const SEED = 42;
const ROTATION_MODE = "auto";
const FAN_SPEED = 1;
const FREEZE_DEG_PER_SEC = 3;
const MIN_FREEZE_FRAMES = 8;

mkdirSync(outDir, { recursive: true });

const defaultFx = { ...DEFAULT_CUBE_SHOWCASE_FX };
const segmentMs = Array.from({ length: N_STEPS }, (_, s) =>
  getFanStepSegmentMs(s, "wedding_default", FAN_SPEED)
);
const loopBridgeMs = 0;
const contentMs = sumSegmentDurations(segmentMs);

function eulerYawPitchRoll(e) {
  return {
    yawDeg: (e.y * 180) / Math.PI,
    pitchDeg: (e.x * 180) / Math.PI,
    rollDeg: (e.z * 180) / Math.PI,
  };
}

function eulerDistDeg(a, b) {
  const dq = new THREE.Quaternion().setFromEuler(a);
  const qq = new THREE.Quaternion().setFromEuler(b);
  const dot = Math.min(1, Math.abs(dq.dot(qq)));
  return (2 * Math.acos(dot) * 180) / Math.PI;
}

function sampleMotion(globalMs, exportRecording) {
  const resolved = resolvePresentationTimeline(globalMs, segmentMs, loopBridgeMs);
  if (resolved.kind === "loop_bridge") {
    return null;
  }
  const { step, stepElapsed } = resolved;
  const face = getPresentationFace(step);
  const phaseState = resolveFanPhase(step, stepElapsed, "wedding_default", FAN_SPEED);
  const motion = runWithFanMotionExportRecording(exportRecording, () =>
    sampleFanCubeMotion(
      step,
      stepElapsed,
      face,
      N_STEPS,
      SEED,
      ROTATION_MODE,
      "wedding_default",
      FAN_SPEED,
      defaultFx,
      exportRecording
    )
  );
  const yawRevs = exportRecording
    ? 0
    : getRevsWithinStep(
        stepElapsed,
        step,
        FAN_SPEED,
        "wedding_default",
        ROTATION_MODE,
        defaultFx
      );
  return {
    globalMs,
    step,
    stepElapsed,
    phase: phaseState.phase,
    phaseU: Number(phaseState.phaseU.toFixed(4)),
    euler: motion.rotation.clone(),
    presentationScale: Number(motion.presentationScale.toFixed(4)),
    yawRevs: Number(yawRevs.toFixed(4)),
    ...eulerYawPitchRoll(motion.rotation),
  };
}

function buildFrameSeries(exportRecording) {
  const frames = [];
  for (let t = 0; t < contentMs; t += FRAME_MS) {
    const s = sampleMotion(Math.round(t), exportRecording);
    if (s) frames.push(s);
  }
  for (let i = 1; i < frames.length; i += 1) {
    const prev = frames[i - 1];
    const cur = frames[i];
    const dt = (cur.globalMs - prev.globalMs) / 1000;
    const dDeg = eulerDistDeg(prev.euler, cur.euler);
    cur.dDeg = Number(dDeg.toFixed(4));
    cur.degPerSec = Number((dDeg / dt).toFixed(2));
    cur.dYawDeg = Number((cur.yawDeg - prev.yawDeg).toFixed(4));
  }
  frames[0].dDeg = 0;
  frames[0].degPerSec = 0;
  frames[0].dYawDeg = 0;
  return frames;
}

function findFreezeWindows(frames) {
  const windows = [];
  let start = null;
  for (let i = 1; i < frames.length; i += 1) {
    const frozen = frames[i].degPerSec < FREEZE_DEG_PER_SEC;
    if (frozen && start === null) start = i - 1;
    if (!frozen && start !== null) {
      const len = i - start;
      if (len >= MIN_FREEZE_FRAMES) {
        windows.push({
          startMs: frames[start].globalMs,
          endMs: frames[i - 1].globalMs,
          durationMs: frames[i - 1].globalMs - frames[start].globalMs + FRAME_MS,
          frames: len,
          step: frames[start].step,
          phase: frames[start].phase,
          endPhase: frames[i - 1].phase,
          avgDegPerSec: Number(
            (
              frames
                .slice(start + 1, i)
                .reduce((a, f) => a + f.degPerSec, 0) / Math.max(1, len - 1)
            ).toFixed(2)
          ),
        });
      }
      start = null;
    }
  }
  return windows;
}

function codeCause(window, exportRecording) {
  const { phase, step, durationMs } = window;
  const approachMs = getFanApproachMs(step, "wedding_default");
  const showcaseMs = getFanShowcaseHoldMs(step, "wedding_default");
  const retreatMs = getFanRetreatMs("wedding_default");

  if (phase === "showcase_hold" || window.endPhase === "showcase_hold") {
    return exportRecording
      ? "fanPhases.sampleShowcaseHoldPhase: applyTimelineYaw(fixed approachMs) — zero ω at peak"
      : "fanPhases.sampleShowcaseHoldPhase: applyTimelineYaw(fixed approachMs) — getRevsWithinStep plateau during showcase";
  }
  if (phase === "retreat" && durationMs > retreatMs * 0.5) {
    return "rotationMotionGate(scale) — should only freeze at peak; check retreat scale sampling";
  }
  if (phase === "approach" && exportRecording) {
    return "rotationMotionGate(scale) — export tumble off only at peak scale";
  }
  if (phase === "handoff") {
    return "fanPhases.sampleHandoffPhase: gap between steps — reduced motion by design";
  }
  return "unknown — inspect phase crossfade / slerp plateau";
}

function summarize(label, exportRecording) {
  const frames = buildFrameSeries(exportRecording);
  const freezes = findFreezeWindows(frames).map((w) => ({
    ...w,
    codeCause: codeCause(w, exportRecording),
  }));
  const phaseStats = {};
  for (const f of frames) {
    const key = `${f.step}:${f.phase}`;
    if (!phaseStats[key]) {
      phaseStats[key] = { step: f.step, phase: f.phase, frames: 0, sumDegPerSec: 0, maxDegPerSec: 0 };
    }
    const s = phaseStats[key];
    s.frames += 1;
    s.sumDegPerSec += f.degPerSec;
    s.maxDegPerSec = Math.max(s.maxDegPerSec, f.degPerSec);
  }
  for (const s of Object.values(phaseStats)) {
    s.avgDegPerSec = Number((s.sumDegPerSec / s.frames).toFixed(2));
    delete s.sumDegPerSec;
  }

  const showcaseFrames = frames.filter((f) => f.phase === "showcase_hold");
  const showcaseFrozen =
    showcaseFrames.length > 1
      ? showcaseFrames.every((f, i) => i === 0 || f.dDeg < 0.01)
      : true;

  return {
    label,
    exportRecording,
    contentMs,
    contentSec: Number((contentMs / 1000).toFixed(2)),
    totalFrames: frames.length,
    freezeWindowCount: freezes.length,
    totalFreezeMs: freezes.reduce((a, w) => a + w.durationMs, 0),
    freezePct: Number(
      ((freezes.reduce((a, w) => a + w.durationMs, 0) / contentMs) * 100).toFixed(1)
    ),
    showcaseHoldFrozen: showcaseFrozen,
    showcaseHoldMs: getFanShowcaseHoldMs(0, "wedding_default"),
    freezes,
    phaseStats: Object.values(phaseStats).sort((a, b) => a.step - b.step || a.phase.localeCompare(b.phase)),
    worstFrames: [...frames].sort((a, b) => a.degPerSec - b.degPerSec).slice(0, 8),
  };
}

const preview = summarize("preview_default_fx", false);
const exportPath = summarize("mp4_export_default_fx", true);

const report = {
  meta: {
    fps: FPS,
    freezeThresholdDegPerSec: FREEZE_DEG_PER_SEC,
    minFreezeFrames: MIN_FREEZE_FRAMES,
    nSteps: N_STEPS,
    rotationMode: ROTATION_MODE,
    showcaseFx: defaultFx,
    segmentMs,
  },
  preview,
  export: exportPath,
  diagnosis: [],
};

const add = (msg) => report.diagnosis.push(msg);

add(
  `쇼케이스 홀드 ${preview.showcaseHoldMs}ms — 의도적 회전 정지(사진 정면 노출). preview frozen=${preview.showcaseHoldFrozen}, export frozen=${exportPath.showcaseHoldFrozen}`
);
add(
  `전체 타임라인 중 정지 구간 비율: preview ${preview.freezePct}%, export ${exportPath.freezePct}%`
);
if (exportPath.freezePct > preview.freezePct + 5) {
  add("export: getExportGatedRevsWithinStep — yaw 적분 시 peak 밖에서만 rev 증가");
}
for (const w of exportPath.freezes.slice(0, 6)) {
  add(`[export ${w.startMs}–${w.endMs}ms step${w.step} ${w.phase}] ${w.codeCause}`);
}

writeFileSync(join(outDir, "freeze_analysis.json"), JSON.stringify(report, null, 2));

console.log("=== Default FX rotation freeze analysis ===\n");
console.log(`Content: ${contentMs}ms (${N_STEPS} steps) @ ${FPS}fps\n`);
console.log("PREVIEW (live):");
console.log(`  freeze windows: ${preview.freezeWindowCount}, ${preview.totalFreezeMs}ms (${preview.freezePct}%)`);
for (const w of preview.freezes) {
  console.log(`    ${w.startMs}-${w.endMs}ms step${w.step} ${w.phase} avg=${w.avgDegPerSec}°/s`);
  console.log(`      → ${w.codeCause}`);
}
console.log("\nMP4 EXPORT:");
console.log(`  freeze windows: ${exportPath.freezeWindowCount}, ${exportPath.totalFreezeMs}ms (${exportPath.freezePct}%)`);
for (const w of exportPath.freezes) {
  console.log(`    ${w.startMs}-${w.endMs}ms step${w.step} ${w.phase} avg=${w.avgDegPerSec}°/s`);
  console.log(`      → ${w.codeCause}`);
}
console.log("\nDiagnosis:");
for (const d of report.diagnosis) console.log(`  • ${d}`);
console.log(`\nWrote ${join(outDir, "freeze_analysis.json")}`);
