/**
 * Frame-to-frame root rotation discontinuities (preview vs export).
 *   npx tsx scripts/measure-rotation-jitter.mjs
 */
import * as THREE from "three";
import { DEFAULT_CUBE_SHOWCASE_FX } from "../packages/shared/src/cubeShowcaseFx.ts";
import { sampleFanCubeMotion } from "../apps/web/src/features/cube/cubeFanTimeline.ts";
import { runWithFanMotionExportRecording } from "../apps/web/src/features/cube/fanExportRotation.ts";
import { getPresentationFace } from "../apps/web/src/features/cube/cubeSequence.ts";
import { resolvePresentationTimeline } from "../apps/web/src/features/cube/cubeMotionVariety.ts";
import { getFanStepSegmentMs } from "../apps/web/src/features/cube/fanTiming.ts";
import { resolveFanPhase } from "../apps/web/src/features/cube/fanTiming.ts";

const FPS = 30;
const FRAME_MS = 1000 / FPS;
const N = 6;
const SEED = 42;
const FX = { ...DEFAULT_CUBE_SHOWCASE_FX };
const segmentMs = Array.from({ length: N }, (_, s) =>
  getFanStepSegmentMs(s, "wedding_default", 1)
);

function eulerJumpDeg(a, b) {
  const dq = new THREE.Quaternion().setFromEuler(a);
  const qq = new THREE.Quaternion().setFromEuler(b);
  return (2 * Math.acos(Math.min(1, Math.abs(dq.dot(qq)))) * 180) / Math.PI;
}

function scan(exportRecording) {
  const jumps = [];
  let maxJump = 0;
  let maxAt = 0;
  let prev = null;
  let prevMs = -FRAME_MS;

  for (let ms = 0; ms <= 59100; ms += FRAME_MS) {
    const resolved = resolvePresentationTimeline(ms, segmentMs, 0);
    if (resolved.kind !== "step") {
      prev = null;
      continue;
    }
    const { step, stepElapsed } = resolved;
    const face = getPresentationFace(step);
    const phase = resolveFanPhase(step, stepElapsed, "wedding_default", 1).phase;
    const cur = runWithFanMotionExportRecording(exportRecording, () =>
      sampleFanCubeMotion(
        step,
        stepElapsed,
        face,
        N,
        SEED,
        "auto",
        "wedding_default",
        1,
        FX,
        exportRecording
      )
    );
    if (prev) {
      const d = eulerJumpDeg(prev.rotation, cur.rotation);
      const dtSec = FRAME_MS / 1000;
      const degPerSec = d / dtSec;
      if (d > maxJump) {
        maxJump = d;
        maxAt = ms;
      }
      if (d > 6) {
        jumps.push({
          ms: Math.round(ms),
          step,
          phase,
          jumpDeg: +d.toFixed(2),
          degPerSec: +degPerSec.toFixed(1),
        });
      }
    }
    prev = cur;
    prevMs = ms;
  }
  return { label: exportRecording ? "export" : "preview", maxJump, maxAt, jumps };
}

for (const r of [false, true]) {
  const { label, maxJump, maxAt, jumps } = scan(r);
  console.log(`\n=== ${label} ===`);
  console.log(`max jump: ${maxJump.toFixed(2)}° at ${Math.round(maxAt)}ms`);
  console.log(`jumps >6°: ${jumps.length}`);
  for (const j of jumps.slice(0, 15)) {
    console.log(`  ${j.ms}ms step${j.step} ${j.phase} ${j.jumpDeg}° (${j.degPerSec}°/s)`);
  }
}
