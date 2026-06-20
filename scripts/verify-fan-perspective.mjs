#!/usr/bin/env node
/**
 * Smoke: fan approach pulls camera + scale (perspective “swoosh”).
 */
import {
  sampleFanCubeMotion,
  FAN_SCALE_FAR,
  FAN_SCALE_PEAK,
} from "../apps/web/src/features/cube/cubeFanTimeline.ts";
import {
  FAN_CAMERA_Z_FAR,
  FAN_CAMERA_Z_CLOSE,
  fanApproachEase,
} from "../apps/web/src/features/cube/fanPerspective.ts";
import { resolveFanPhase } from "../apps/web/src/features/cube/fanTiming.ts";

function ok(name, pass, detail = "") {
  console.log(`[${pass ? "OK" : "FAIL"}] ${name}${detail ? `: ${detail}` : ""}`);
  if (!pass) process.exitCode = 1;
}

const zoomFx = {
  cubeHeartbeatEnabled: false,
  cubeShowcaseZoomEnabled: true,
  cubeSubjectPullEnabled: false,
};

const approachMid = sampleFanCubeMotion(0, 600, 4, 6, 42, "mixed", "wedding_default", 1, zoomFx);
ok("approach mid: camera closer than far", approachMid.cameraZ < FAN_CAMERA_Z_FAR - 0.2);
ok("approach mid: scale above far", approachMid.presentationScale > FAN_SCALE_FAR + 0.08);

const approachEnd = sampleFanCubeMotion(0, 2390, 4, 6, 42, "mixed", "wedding_default", 1, zoomFx);
ok(
  "approach end: scale near peak",
  Math.abs(approachEnd.presentationScale - FAN_SCALE_PEAK) < 0.04,
  String(approachEnd.presentationScale)
);
ok(
  "approach end: camera near close",
  approachEnd.cameraZ < FAN_CAMERA_Z_CLOSE + 0.15,
  String(approachEnd.cameraZ)
);

const hold = sampleFanCubeMotion(0, 2600, 4, 6, 42, "mixed", "wedding_default", 1, zoomFx);
ok("showcase: camera at close range", hold.cameraZ <= FAN_CAMERA_Z_CLOSE + 0.05);

const phase = resolveFanPhase(0, 1200);
ok("expo ease accelerates late", fanApproachEase(0.8) > 0.75, String(fanApproachEase(0.8)));

if (process.exitCode) {
  process.exit(1);
}
console.log("verify-fan-perspective: OK");
