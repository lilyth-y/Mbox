#!/usr/bin/env node
/**
 * Loop bridge must inherit camera offsets from step end (CubeView used to force Y=0).
 */
import {
  sampleFanCubeMotion,
  computeFanLoopBridgeFrame,
  getFanStepSegmentMs,
} from "../apps/web/src/features/cube/cubeFanTimeline.ts";
import { getPresentationFace } from "../apps/web/src/features/cube/cubeSequence.ts";
import { FAN_LOOP_BRIDGE_MS } from "../apps/web/src/features/cube/fanTiming.ts";
import { resolveCubeShowcaseFx } from "../packages/shared/src/cubeShowcaseFx.ts";

function ok(name, pass, detail = "") {
  console.log(`[${pass ? "OK" : "FAIL"}] ${name}${detail ? `: ${detail}` : ""}`);
  if (!pass) process.exitCode = 1;
}

const presentationCount = 6;
const lastStep = presentationCount - 1;
const motionSeed = 42;
const profile = "wedding_default";
const speedMul = 1;
const rotationMode = "mixed";

for (const label of ["zoom_on", "zoom_off"]) {
  const fx = resolveCubeShowcaseFx({
    cubeShowcaseZoomEnabled: label === "zoom_on",
    cubeHeartbeatEnabled: false,
  });
  const totalStepMs = getFanStepSegmentMs(lastStep, profile, speedMul);
  const end = sampleFanCubeMotion(
    lastStep,
    Math.max(0, totalStepMs - 1),
    getPresentationFace(lastStep),
    presentationCount,
    motionSeed,
    rotationMode,
    profile,
    speedMul,
    fx,
    false
  );
  const bridge0 = computeFanLoopBridgeFrame(
    0,
    FAN_LOOP_BRIDGE_MS,
    lastStep,
    motionSeed,
    rotationMode,
    profile,
    speedMul,
    fx
  );
  const bridgeEnd = computeFanLoopBridgeFrame(
    FAN_LOOP_BRIDGE_MS - 1,
    FAN_LOOP_BRIDGE_MS,
    lastStep,
    motionSeed,
    rotationMode,
    profile,
    speedMul,
    fx
  );
  const step0 = sampleFanCubeMotion(
    0,
    0,
    getPresentationFace(0),
    presentationCount,
    motionSeed,
    rotationMode,
    profile,
    speedMul,
    fx,
    false
  );

  const dy = (a, b) => Math.abs((a.cameraOffsetY ?? 0) - (b.cameraOffsetY ?? 0));
  ok(`${label}: step end → bridge start cameraY`, dy(end, bridge0) < 0.002, dy(end, bridge0).toFixed(5));
  ok(`${label}: bridge end → step0 start cameraY`, dy(bridgeEnd, step0) < 0.002, dy(bridgeEnd, step0).toFixed(5));
  if (label === "zoom_off") {
    ok(`${label}: step0 approach cameraY is 0`, Math.abs(step0.cameraOffsetY ?? 0) < 1e-6);
  }
}

if (process.exitCode) process.exit(1);
console.log("verify-loop-bridge-camera-seam: OK");
