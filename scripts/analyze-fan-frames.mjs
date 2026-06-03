/**
 * Frame-by-frame fan wedding timeline analysis (30 fps sampling + phase keyframes).
 *   npx tsx scripts/analyze-fan-frames.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  FAN_LOOP_BRIDGE_MS,
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

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "experiments", "outputs", "fan_frame_analysis");
const FPS = Number(process.env.FAN_ANALYSIS_FPS ?? 30);
const FRAME_MS = 1000 / FPS;
const PRESENTATION_COUNT = Number(process.env.FAN_ANALYSIS_STEPS ?? 3);
const MOTION_SEED = Number(process.env.FAN_ANALYSIS_SEED ?? 42);
const ROTATION_MODE = process.env.FAN_ANALYSIS_ROTATION ?? "mixed";

mkdirSync(outDir, { recursive: true });

const segmentMs = Array.from({ length: PRESENTATION_COUNT }, (_, s) =>
  getFanStepSegmentMs(s),
);
const loopBridgeMs = getLoopBridgeMs("cube_focus", PRESENTATION_COUNT);
const cycleMs = sumSegmentDurations(segmentMs) + loopBridgeMs;

function radToDeg(r) {
  return (r * 180) / Math.PI;
}

function sampleAtGlobalMs(globalMs) {
  const resolved = resolvePresentationTimeline(globalMs, segmentMs, loopBridgeMs);
  if (resolved.kind === "loop_bridge") {
    return {
      globalMs,
      kind: "loop_bridge",
      step: resolved.lastStep,
      stepElapsed: resolved.bridgeElapsed,
      phase: "loop_bridge",
      phaseU: resolved.bridgeElapsed / Math.max(loopBridgeMs, 1),
      scale: null,
      rotYDeg: null,
      parallax: 0,
      focusPulse: 0,
      face: getPresentationFace(resolved.lastStep),
    };
  }

  const { step, stepElapsed } = resolved;
  const face = getPresentationFace(step);
  const phaseState = resolveFanPhase(step, stepElapsed);
  const motion = sampleFanCubeMotion(
    step,
    stepElapsed,
    face,
    PRESENTATION_COUNT,
    MOTION_SEED,
    ROTATION_MODE,
  );

  return {
    globalMs,
    kind: "step",
    step,
    stepElapsed,
    phase: phaseState.phase,
    phaseU: Number(phaseState.phaseU.toFixed(4)),
    phaseElapsed: phaseState.phaseElapsed,
    scale: Number(motion.presentationScale.toFixed(4)),
    rotYDeg: Number(radToDeg(motion.rotation.y).toFixed(2)),
    rotXDeg: Number(radToDeg(motion.rotation.x).toFixed(2)),
    parallax: Number(motion.parallaxAmount.toFixed(4)),
    focusPulse: Number(motion.focusPulse.toFixed(4)),
    face,
  };
}

const frames = [];
for (let t = 0; t < cycleMs; t += FRAME_MS) {
  frames.push(sampleAtGlobalMs(Math.round(t)));
}

const keyframeMarks = [];
for (let step = 0; step < PRESENTATION_COUNT; step += 1) {
  const seg = segmentMs[step];
  const boundaries = [0, 0.25, 0.5, 0.75, 0.999].map((u) => Math.min(seg - 1, Math.floor(seg * u)));
  let offset = 0;
  for (let s = 0; s < step; s += 1) offset += segmentMs[s];
  for (const b of boundaries) {
    keyframeMarks.push(sampleAtGlobalMs(offset + b));
  }
}
if (loopBridgeMs > 0) {
  let offset = sumSegmentDurations(segmentMs);
  for (const u of [0, 0.5, 0.999]) {
    keyframeMarks.push(sampleAtGlobalMs(offset + Math.floor(loopBridgeMs * u)));
  }
}

const discontinuities = [];
for (let i = 1; i < frames.length; i += 1) {
  const prev = frames[i - 1];
  const cur = frames[i];
  if (prev.kind !== "step" || cur.kind !== "step") continue;
  if (prev.scale == null || cur.scale == null) continue;
  const dScale = Math.abs(cur.scale - prev.scale);
  const dRotY = Math.abs(cur.rotYDeg - prev.rotYDeg);
  if (dScale > 0.04 || dRotY > 8) {
    discontinuities.push({
      frameIndex: i,
      atMs: cur.globalMs,
      step: cur.step,
      phase: cur.phase,
      dScale: Number(dScale.toFixed(4)),
      dRotY: Number(dRotY.toFixed(2)),
      prevScale: prev.scale,
      curScale: cur.scale,
    });
  }
}

const phaseSummary = {};
for (const f of frames) {
  if (f.kind !== "step") continue;
  const key = `step${f.step}:${f.phase}`;
  if (!phaseSummary[key]) {
    phaseSummary[key] = {
      count: 0,
      scaleMin: Infinity,
      scaleMax: -Infinity,
      focusMax: 0,
    };
  }
  const s = phaseSummary[key];
  s.count += 1;
  s.scaleMin = Math.min(s.scaleMin, f.scale);
  s.scaleMax = Math.max(s.scaleMax, f.scale);
  s.focusMax = Math.max(s.focusMax, f.focusPulse);
}

const stepBoundaries = [];
for (let step = 0; step < PRESENTATION_COUNT - 1; step += 1) {
  let offset = 0;
  for (let s = 0; s < step; s += 1) offset += segmentMs[s];
  const endMs = offset + segmentMs[step] - 1;
  const startMs = offset + segmentMs[step];
  const endF = sampleAtGlobalMs(endMs);
  const startF = sampleAtGlobalMs(startMs);
  stepBoundaries.push({
    fromStep: step,
    toStep: step + 1,
    endMs,
    startMs,
    endScale: endF.scale,
    startScale: startF.scale,
    scaleDelta: endF.scale != null && startF.scale != null ? Number((startF.scale - endF.scale).toFixed(4)) : null,
    endPhase: endF.phase,
    startPhase: startF.phase,
  });
}

const report = {
  ok: discontinuities.filter((d) => d.dScale > 0.06).length === 0,
  meta: {
    fps: FPS,
    frameMs: FRAME_MS,
    presentationCount: PRESENTATION_COUNT,
    motionSeed: MOTION_SEED,
    rotationMode: ROTATION_MODE,
    segmentMs,
    loopBridgeMs,
    cycleMs,
    cycleSec: Number((cycleMs / 1000).toFixed(2)),
    totalFrames: frames.length,
  },
  phaseSummary,
  stepBoundaries,
  discontinuities: discontinuities.slice(0, 40),
  keyframes: keyframeMarks,
};

writeFileSync(join(outDir, "fan_frames_30fps.json"), JSON.stringify(frames, null, 2));
writeFileSync(join(outDir, "fan_analysis.json"), JSON.stringify(report, null, 2));

const md = [
  "# Fan wedding timeline — frame analysis",
  "",
  `Generated: ${new Date().toISOString()}`,
  "",
  "## Cycle",
  `- Photos: ${PRESENTATION_COUNT}`,
  `- Segment ms: ${segmentMs.join(", ")}`,
  `- Loop bridge: ${loopBridgeMs} ms`,
  `- **Total: ${report.meta.cycleSec}s** (${report.meta.totalFrames} frames @ ${FPS} fps)`,
  "",
  "## Phase scale ranges (30fps samples)",
  "| Phase | Frames | Scale min | Scale max | Max focusPulse |",
  "|-------|--------|-----------|-----------|----------------|",
  ...Object.entries(phaseSummary).map(([k, v]) =>
    `| ${k} | ${v.count} | ${v.scaleMin.toFixed(3)} | ${v.scaleMax.toFixed(3)} | ${v.focusMax.toFixed(3)} |`,
  ),
  "",
  "## Step boundaries (last ms → first ms of next step)",
  "| From→To | End phase | Start phase | Scale end | Scale start | Δ |",
  "|---------|-----------|-------------|-----------|-------------|---|",
  ...stepBoundaries.map(
    (b) =>
      `| ${b.fromStep}→${b.toStep} | ${b.endPhase} | ${b.startPhase} | ${b.endScale} | ${b.startScale} | ${b.scaleDelta} |`,
  ),
  "",
  "## Discontinuities (|Δscale|>0.04 or |ΔrotY|>8° between adjacent frames)",
  discontinuities.length === 0
    ? "_None detected — transitions are smooth at 30fps._"
    : "| ms | step | phase | Δscale | ΔrotY° |",
  ...(discontinuities.length === 0
    ? []
    : ["|----|------|-------|--------|--------|", ...discontinuities.map(
        (d) => `| ${d.atMs} | ${d.step} | ${d.phase} | ${d.dScale} | ${d.dRotY} |`,
      )]),
  "",
  "## Keyframes (phase quartiles)",
  "| ms | step | phase | u | scale | rotY° | focus |",
  "|----|------|-------|---|-------|-------|-------|",
  ...keyframeMarks.map(
    (k) =>
      `| ${k.globalMs} | ${k.step ?? "-"} | ${k.phase} | ${k.phaseU ?? "-"} | ${k.scale ?? "-"} | ${k.rotYDeg ?? "-"} | ${k.focusPulse ?? "-"} |`,
  ),
  "",
  `**Verdict:** ${report.ok ? "PASS — no large scale jumps between consecutive 30fps samples." : "REVIEW — see discontinuities."}`,
  "",
].join("\n");

writeFileSync(join(outDir, "report.md"), md, "utf8");

console.log(md);
console.log(`\nWrote ${join(outDir, "report.md")}`);
console.log(`Wrote ${join(outDir, "fan_analysis.json")} (${frames.length} frames)`);
process.exit(report.ok ? 0 : 1);
