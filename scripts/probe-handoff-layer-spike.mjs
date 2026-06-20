/**
 * Decompose handoff rotation layers and locate ω spikes.
 *   npx tsx scripts/probe-handoff-layer-spike.mjs
 */
import * as THREE from "three";
import { DEFAULT_CUBE_SHOWCASE_FX } from "../packages/shared/src/cubeShowcaseFx.ts";
import { getPresentationFace, getCubeShowcaseRootRotation } from "../apps/web/src/features/cube/cubeSequence.ts";
import { getCubeExitRotation } from "../apps/web/src/features/cube/cubeTransitionRotation.ts";
import {
  getStepPhaseBoundaryMs,
  resolveInPlaceHandoffEndRotation,
  IN_PLACE_HANDOFF_TUMBLE_DECAY_END_U,
  IN_PLACE_HANDOFF_TUMBLE_DECAY_START_U,
} from "../apps/web/src/features/cube/fanRotationComposer.ts";
import { applyTimelineYawAfterShowcase, applyAxisTumble } from "../apps/web/src/features/cube/fanMotionCommon.ts";
import { resolveFanPhase, FAN_GAP_MS, FAN_SCALE_RETREAT } from "../apps/web/src/features/cube/fanTiming.ts";
import { exportTransitTumbleIntensity, isFanMotionExportRecording } from "../apps/web/src/features/cube/fanExportRotation.ts";
import { fanSmootherstep } from "../apps/web/src/features/cube/fanEase.ts";
import { resolvePreviewTumbleIntensity } from "../apps/web/src/features/cube/fanMotionCommon.ts";

function quatFromEuler(e) {
  return new THREE.Quaternion().setFromEuler(e).normalize();
}

function angleDeg(a, b) {
  const qa = quatFromEuler(a);
  const qb = quatFromEuler(b);
  const dot = Math.abs(qa.dot(qb));
  return (2 * Math.acos(Math.min(1, Math.max(-1, dot))) * 180) / Math.PI;
}

function omegaDegPerSec(a, b, dtMs) {
  return (angleDeg(a, b) / Math.max(dtMs, 1e-6)) * 1000;
}

const PROFILE = "wedding_default";
const SPEED = 1;
const N = 6;
const STEP = 0;
const MOTION_SEED = 42;
const ROTATION_MODE = "auto";
const FX = { ...DEFAULT_CUBE_SHOWCASE_FX, cubeComplexRotationEnabled: true };

const bounds = getStepPhaseBoundaryMs(STEP, PROFILE, SPEED);
const face = getCubeShowcaseRootRotation(getPresentationFace(STEP));
const exit = getCubeExitRotation(STEP, N);

function layerRotationAt(elapsedMs) {
  const state = resolveFanPhase(STEP, elapsedMs, PROFILE, SPEED);
  if (state.phase !== "handoff") {
    return null;
  }
  const motionElapsed = bounds.showcaseEndMs + bounds.retreatMs + state.phaseElapsed;

  const orientBase = face.clone(); // retreatOrientEase(1) slerp is already face→exit at u=1; face is sufficient for layer diff
  const yaw = applyTimelineYawAfterShowcase(
    orientBase,
    STEP,
    motionElapsed,
    bounds.showcaseEndMs,
    MOTION_SEED,
    ROTATION_MODE,
    SPEED,
    PROFILE,
    FX
  );

  const whooshScale = 0.3;
  const tumbleI = isFanMotionExportRecording()
    ? exportTransitTumbleIntensity("handoff", state.phaseU, FAN_SCALE_RETREAT)
    : (() => {
        const tumbleRamp = fanSmootherstep(0, 0.1, state.phaseU);
        const tumbleDecay =
          1 -
          fanSmootherstep(
            IN_PLACE_HANDOFF_TUMBLE_DECAY_START_U,
            IN_PLACE_HANDOFF_TUMBLE_DECAY_END_U,
            state.phaseU
          );
        return resolvePreviewTumbleIntensity(FX) * whooshScale * tumbleRamp * tumbleDecay;
      })();
  const tumbleElapsed = state.phaseElapsed;
  const tumbled = tumbleI > 0.001 ? applyAxisTumble(yaw, STEP, tumbleElapsed, MOTION_SEED, tumbleI, FX) : yaw;

  const endRot = resolveInPlaceHandoffEndRotation(
    STEP,
    face,
    exit,
    MOTION_SEED,
    ROTATION_MODE,
    SPEED,
    PROFILE,
    FX
  );
  // settle uses smootherstep between SETTLE_START_U..1; approximate by calling the real exported function through endRot blend
  // We can't call applyInPlaceHandoffSettle without importing the full composer file; instead, mimic its behavior using the constant.
  // (This script's goal is locating which pre-settle layer spikes, not exact final pose.)
  return { state, yaw, tumbled, endRot };
}

const dt = 5;
let maxYaw = { w: 0, at: 0 };
let maxTumble = { w: 0, at: 0 };

const handoffStart = bounds.retreatEndMs;
const handoffEnd = bounds.stepEndMs;

let prevYaw = null;
let prevTumbled = null;
let prevMs = null;

for (let ms = handoffStart; ms <= handoffEnd - dt; ms += dt) {
  const cur = layerRotationAt(ms);
  const nxt = layerRotationAt(ms + dt);
  if (!cur || !nxt) continue;

  const wy = omegaDegPerSec(cur.yaw, nxt.yaw, dt);
  const wt = omegaDegPerSec(cur.tumbled, nxt.tumbled, dt);

  if (wy > maxYaw.w) maxYaw = { w: wy, at: ms };
  if (wt > maxTumble.w) maxTumble = { w: wt, at: ms };

  prevYaw = cur.yaw;
  prevTumbled = cur.tumbled;
  prevMs = ms;
}

console.log(`handoff window ms=[${handoffStart.toFixed(0)}, ${handoffEnd.toFixed(0)}] dt=${dt}ms`);
console.log(`max ω yawOnly=${maxYaw.w.toFixed(1)}°/s @ elapsed=${maxYaw.at}`);
console.log(`max ω yaw+tumble=${maxTumble.w.toFixed(1)}°/s @ elapsed=${maxTumble.at}`);

