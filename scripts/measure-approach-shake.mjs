/** Approach-phase high-frequency rotation (shake vs smooth spin). */
import * as THREE from "three";
import { DEFAULT_CUBE_SHOWCASE_FX } from "../packages/shared/src/cubeShowcaseFx.ts";
import { sampleFanCubeMotion } from "../apps/web/src/features/cube/cubeFanTimeline.ts";
import { resolvePresentationTimeline } from "../apps/web/src/features/cube/cubeMotionVariety.ts";
import { getPresentationFace } from "../apps/web/src/features/cube/cubeSequence.ts";
import { getFanStepSegmentMs, resolveFanPhase } from "../apps/web/src/features/cube/fanTiming.ts";
import { fanAxisTumble } from "../apps/web/src/features/cube/fanAxisWander.ts";

const FRAME_MS = 1000 / 30;
const FX = { ...DEFAULT_CUBE_SHOWCASE_FX };
const segmentMs = Array.from({ length: 6 }, (_, s) =>
  getFanStepSegmentMs(s, "wedding_default", 1)
);

function sampleApproach(ms) {
  const resolved = resolvePresentationTimeline(ms, segmentMs, 0);
  if (resolved.kind !== "step") return null;
  const phase = resolveFanPhase(resolved.step, resolved.stepElapsed, "wedding_default", 1);
  if (phase.phase !== "approach") return null;
  const face = getPresentationFace(resolved.step);
  const m = sampleFanCubeMotion(
    resolved.step,
    resolved.stepElapsed,
    face,
    6,
    42,
    "auto",
    "wedding_default",
    1,
    FX,
    false
  );
  return { ms, scale: m.presentationScale, rot: m.rotation };
}

function hfJitter(frames, key) {
  let sum = 0;
  let flips = 0;
  for (let i = 2; i < frames.length; i++) {
    const a = frames[i - 2][key];
    const b = frames[i - 1][key];
    const c = frames[i][key];
    const d1 = b - a;
    const d2 = c - b;
    sum += Math.abs(d2 - d1);
    if (d1 * d2 < 0 && Math.abs(d1) > 0.001 && Math.abs(d2) > 0.001) flips++;
  }
  return { avgAccel: sum / Math.max(1, frames.length - 2), signFlips: flips };
}

const frames = [];
for (let ms = 0; ms <= 3400; ms += FRAME_MS) {
  const s = sampleApproach(ms);
  if (s) frames.push(s);
}

const pitch = frames.map((f) => f.rot.x);
const roll = frames.map((f) => f.rot.z);
const scale = frames.map((f) => f.scale);

console.log("approach frames", frames.length);
console.log("scale range", scale[0]?.toFixed(3), "→", scale.at(-1)?.toFixed(3));
console.log("pitch HF:", hfJitter(frames.map((f, i) => ({ p: pitch[i] })), "p"));
console.log("roll HF:", hfJitter(frames.map((f, i) => ({ p: roll[i] })), "p"));

// isolate tumble sin/cos contribution
const seed = 42;
const step = 0;
let prev = null;
let tumbleOnlyFlips = 0;
for (let ms = 33; ms <= 3300; ms += 33) {
  const t = ms;
  const e = new THREE.Euler(0, 0, 0);
  const r = fanAxisTumble(e, step, t, seed, 0.38);
  if (prev) {
    const dp = r.x - prev.x;
    const dpp = prev.dp ?? 0;
    if (dp * dpp < 0 && Math.abs(dp) > 0.002) tumbleOnlyFlips++;
    prev.dp = dp;
  } else prev = {};
  prev.x = r.x;
}
console.log("tumble-only pitch sign flips (0.38 int):", tumbleOnlyFlips);
