/**
 * Choreography continuity checks for fan-blade cube_focus timeline.
 *   npx tsx scripts/verify-fan-choreography.mjs
 */
import {
  FAN_SCALE_FAR,
  FAN_SCALE_RETREAT,
  computeFanLoopBridgeFrame,
  getFanStepSegmentMs,
  sampleFanCubeMotion,
} from "../apps/web/src/features/cube/cubeFanTimeline.ts";

const seed = 42;
const presentationCount = 3;
const currentFace = 4;
const findings = [];

function note(severity, code, detail) {
  findings.push({ severity, code, detail });
}

for (let step = 0; step < presentationCount; step += 1) {
  const segMs = getFanStepSegmentMs(step);
  const end = sampleFanCubeMotion(step, segMs - 1, currentFace, presentationCount, seed);
  const nextStep = step + 1;
  if (nextStep >= presentationCount) {
    continue;
  }
  const nextStart = sampleFanCubeMotion(nextStep, 0, currentFace, presentationCount, seed);
  const dScale = Math.abs(end.presentationScale - nextStart.presentationScale);
  if (dScale > 0.05) {
    note("warn", "STEP_BOUNDARY_SCALE_JUMP", {
      step,
      nextStep,
      endScale: end.presentationScale,
      nextStartScale: nextStart.presentationScale,
      delta: dScale,
    });
  }
}

const lastStep = presentationCount - 1;
const lastSeg = getFanStepSegmentMs(lastStep);
const lastEnd = sampleFanCubeMotion(lastStep, lastSeg - 1, currentFace, presentationCount, seed);
const step0Start = sampleFanCubeMotion(0, 0, currentFace, presentationCount, seed).presentationScale;

note("info", "LOOP_LOOP_BRIDGE_SCALE", {
  lastEndScale: lastEnd.presentationScale,
  bridgeStart: FAN_SCALE_RETREAT,
  bridgeEnd: FAN_SCALE_FAR,
  step0ApproachStart: step0Start,
});

const bridgeMid = computeFanLoopBridgeFrame(550, 1_100, lastStep);
let midScale = 0;
bridgeMid.applyRootTransform({
  rotation: { x: 0, y: 0, z: 0, set: () => {} },
  position: { x: 0, y: 0, z: 0, set: () => {} },
  scale: {
    set(s) {
      midScale = s;
    },
  },
});

note("info", "LOOP_BRIDGE_MID_SCALE", {
  midScale,
  expectedNear: (FAN_SCALE_RETREAT + FAN_SCALE_FAR) / 2,
});

const warnings = findings.filter((f) => f.severity === "warn");
const ok = warnings.length === 0;
console.log(JSON.stringify({ ok, findings }, null, 2));
process.exit(ok ? 0 : 1);
