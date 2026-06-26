#!/usr/bin/env node
import * as THREE from "three";
import { getFanStepSegmentMs, FAN_LOOP_BRIDGE_MS, resolveFanPhase } from "../apps/web/src/features/cube/fanTiming.ts";
import { resolvePresentationTimeline } from "../apps/web/src/features/cube/cubeMotionVariety.ts";
import { computePresentationFrame, computePresentationLoopBridgeFrame } from "../apps/web/src/features/cube/presentationFrame.ts";
import { getPresentationFace } from "../apps/web/src/features/cube/cubeSequence.ts";
import { resolveCubeShowcaseFx } from "../packages/shared/src/cubeShowcaseFx.ts";

const pc = 6;
const segs = Array.from({ length: pc }, (_, i) => getFanStepSegmentMs(i));
const loopMs = FAN_LOOP_BRIDGE_MS;
const content = segs.reduce((a, b) => a + b, 0);
const fx = resolveCubeShowcaseFx({ cubeShowcaseZoomEnabled: false });

function rotAt(t) {
  const r = resolvePresentationTimeline(t, segs, loopMs);
  let frame;
  if (r.kind === "loop_bridge") {
    frame = computePresentationLoopBridgeFrame("cube_focus", r.bridgeElapsed, loopMs, r.lastStep, {
      motionSeed: 42,
      fanSpeed: 1,
      cubeShowcaseFx: fx,
    });
  } else {
    frame = computePresentationFrame("cube_focus", r.step, r.stepElapsed, pc, getPresentationFace(r.step), {
      motionSeed: 42,
      fanSpeed: 1,
      cubeShowcaseFx: fx,
    });
  }
  return frame.fanRootMotion.rotation;
}

for (const t of [58128, 58144, 58160, 58176, content - 1, content, content + 1, content + 16, content + loopMs - 1, content + loopMs]) {
  const r = resolvePresentationTimeline(t, segs, loopMs);
  const ph = r.kind === "step" ? resolveFanPhase(r.step, r.stepElapsed) : null;
  console.log(
    `t=${t}`,
    r.kind,
    r.kind === "step" ? `step=${r.step} el=${r.stepElapsed} phase=${ph.phase} u=${ph.phaseU.toFixed(3)}` : `bel=${r.bridgeElapsed}`
  );
}

const a = rotAt(58144);
const b = rotAt(58160);
const jump = new THREE.Quaternion().setFromEuler(a).angleTo(new THREE.Quaternion().setFromEuler(b));
console.log("jump 58144→58160", jump, "rad", (jump * 180) / Math.PI, "deg");
console.log("contentMs", content, "cycleMs", content + loopMs);
