#!/usr/bin/env node
/**
 * Probe vertical discontinuities: cameraOffsetY, scale, root Y, cameraZ at step/loop seams.
 */
import * as THREE from "three";
import { getFanStepSegmentMs } from "../apps/web/src/features/cube/fanTiming.ts";
import { getPresentationFace } from "../apps/web/src/features/cube/cubeSequence.ts";
import { FAN_LOOP_BRIDGE_MS } from "../apps/web/src/features/cube/fanTiming.ts";
import { resolveCubeShowcaseFx } from "../packages/shared/src/cubeShowcaseFx.ts";
import {
  computePresentationFrame,
  computePresentationLoopBridgeFrame,
} from "../apps/web/src/features/cube/presentationFrame.ts";

const pc = 6;
const segs = Array.from({ length: pc }, (_, i) => getFanStepSegmentMs(i));
const loopMs = FAN_LOOP_BRIDGE_MS;

function frameAt(step, el, fx) {
  return computePresentationFrame("cube_focus", step, el, pc, getPresentationFace(step), {
    motionSeed: 42,
    fanSpeed: 1,
    cubeShowcaseFx: fx,
  });
}

function metrics(frame) {
  return {
    camY: frame.cameraOffsetY ?? 0,
    camZ: frame.cameraZ ?? 0,
    scale: frame.fanRootMotion?.presentationScale ?? 1,
    rotY: frame.fanRootMotion?.rotation.y ?? 0,
  };
}

function report(label, a, b) {
  const ma = metrics(a);
  const mb = metrics(b);
  const dRot = Math.abs(
    new THREE.Quaternion().setFromEuler(a.fanRootMotion.rotation).angleTo(
      new THREE.Quaternion().setFromEuler(b.fanRootMotion.rotation)
    )
  );
  console.log(
    `${label}: dCamY=${Math.abs(ma.camY - mb.camY).toFixed(5)} dCamZ=${Math.abs(ma.camZ - mb.camZ).toFixed(4)} dScale=${Math.abs(ma.scale - mb.scale).toFixed(5)} dRot=${dRot.toFixed(5)}`
  );
}

for (const fxName of ["in_place", "zoom_on", "heartbeat"]) {
  const fx =
    fxName === "in_place"
      ? resolveCubeShowcaseFx({ cubeShowcaseZoomEnabled: false, cubeHeartbeatEnabled: false })
      : fxName === "zoom_on"
        ? resolveCubeShowcaseFx({ cubeShowcaseZoomEnabled: true, cubeHeartbeatEnabled: false })
        : resolveCubeShowcaseFx({ cubeShowcaseZoomEnabled: false, cubeHeartbeatEnabled: true });
  console.log(`\n=== ${fxName} ===`);
  for (let step = 0; step < pc - 1; step++) {
    report(`step ${step}→${step + 1}`, frameAt(step, segs[step] - 1, fx), frameAt(step + 1, 0, fx));
  }
  const last = pc - 1;
  report(
    "last→bridge0",
    frameAt(last, segs[last] - 1, fx),
    computePresentationLoopBridgeFrame("cube_focus", 0, loopMs, last, {
      motionSeed: 42,
      fanSpeed: 1,
      cubeShowcaseFx: fx,
    })
  );
  report(
    "bridgeEnd→step0",
    computePresentationLoopBridgeFrame("cube_focus", loopMs - 1, loopMs, last, {
      motionSeed: 42,
      fanSpeed: 1,
      cubeShowcaseFx: fx,
    }),
    frameAt(0, 0, fx)
  );
}
