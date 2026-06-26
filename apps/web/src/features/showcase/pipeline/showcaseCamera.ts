import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { HOLOGRAM_DISPLAY_SPEC } from "@mbox/shared";
import { OUTER_SIZE } from "../babylon/jewelCubeMaterials";
import {
  getPhotoCrystalFramingExtent,
  getPhotoCrystalPullPhotoExtent,
} from "../babylon/photoCrystalShapeCatalog";
import { shellFlatCavitySpan } from "../babylon/photoCrystalShapeGeometry";
import { getShowcaseAerialAnchor } from "./showcaseAerialAnchor";
import type { ShowcasePipelineConfig, ShowcaseStageContext } from "./types";
import type { ShowcasePresentationPreferences } from "./showcasePresentationPreferences";

export type ShowcaseCameraProfile = "presentation" | "fall" | "bounce" | "pull";

function easeInOutCubic(t: number): number {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
}

export function lerpAngle(from: number, to: number, t: number): number {
  let delta = to - from;
  while (delta > Math.PI) {
    delta -= Math.PI * 2;
  }
  while (delta < -Math.PI) {
    delta += Math.PI * 2;
  }
  return from + delta * t;
}

/** Snap hero yaw so a single cube side face squares to camera (90° steps). */
export function snapYawToNearestFaceCardinal(
  yaw: number,
  step = Math.PI / 2
): number {
  return Math.round(yaw / step) * step;
}

/** Shortest path to a cube side face (90° steps). */
export function nearestCardinalYawFrom(fromYaw: number, idealYaw: number): number {
  const cardinal = snapYawToNearestFaceCardinal(idealYaw);
  let best = cardinal;
  let bestAbs = Math.abs(wrapAngleDelta(cardinal - fromYaw));
  for (const offset of [-Math.PI * 2, Math.PI * 2, -Math.PI, Math.PI]) {
    const candidate = cardinal + offset;
    const abs = Math.abs(wrapAngleDelta(candidate - fromYaw));
    if (abs < bestAbs) {
      bestAbs = abs;
      best = candidate;
    }
  }
  return best;
}

function wrapAngleDelta(delta: number): number {
  let d = delta;
  while (d > Math.PI) {
    d -= Math.PI * 2;
  }
  while (d < -Math.PI) {
    d += Math.PI * 2;
  }
  return d;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

type SpringState = {
  targetVel: Vector3;
  radiusVel: number;
  alphaVel: number;
  betaVel: number;
};

function getSpring(cam: ArcRotateCamera): SpringState {
  const anyCam = cam as unknown as { __mboxSpring?: SpringState };
  if (!anyCam.__mboxSpring) {
    anyCam.__mboxSpring = {
      targetVel: new Vector3(0, 0, 0),
      radiusVel: 0,
      alphaVel: 0,
      betaVel: 0,
    };
  }
  return anyCam.__mboxSpring;
}

/** Clear spring velocities — call at stage boundaries (e.g. ascend enter). */
export function resetShowcaseCameraSpring(cam: ArcRotateCamera): void {
  const spring = getSpring(cam);
  spring.targetVel.set(0, 0, 0);
  spring.radiusVel = 0;
  spring.alphaVel = 0;
  spring.betaVel = 0;
}

function wrapAngle(delta: number): number {
  let d = delta;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function springScalar(
  current: number,
  target: number,
  vel: number,
  dtSec: number,
  stiffness: number,
  damping: number
): { value: number; vel: number } {
  // Critically-damped-ish spring: x'' = k(x_t - x) - c x'
  const k = Math.max(0, stiffness);
  const c = Math.max(0, damping);
  const a = (target - current) * k - vel * c;
  const nextVel = vel + a * dtSec;
  const next = current + nextVel * dtSec;
  return { value: next, vel: nextVel };
}

function springAngle(
  current: number,
  target: number,
  vel: number,
  dtSec: number,
  stiffness: number,
  damping: number
): { value: number; vel: number } {
  const delta = wrapAngle(target - current);
  const k = Math.max(0, stiffness);
  const c = Math.max(0, damping);
  const a = delta * k - vel * c;
  const nextVel = vel + a * dtSec;
  const next = current + nextVel * dtSec;
  return { value: next, vel: nextVel };
}

function getFramingExtent(ctx: ShowcaseStageContext): number {
  const base = ctx.rig ? getPhotoCrystalFramingExtent(ctx.rig.shapeId) : OUTER_SIZE;
  const scale = ctx.rig?.crystalSizeScale ?? 1;
  return base * scale;
}

function getPullPhotoFramingRadius(ctx: ShowcaseStageContext): number {
  const fill = HOLOGRAM_DISPLAY_SPEC.pullPhotoViewportFill;
  const photoExtent =
    ctx.rig != null
      ? ctx.rig.shapeId === "cube" && ctx.rig.photoLayout === "cube"
        ? getPhotoCrystalFramingExtent(ctx.rig.shapeId) * ctx.rig.crystalSizeScale
        : getPhotoCrystalPullPhotoExtent(ctx.rig.shapeId, ctx.rig.photoLayout) *
          ctx.rig.crystalSizeScale
      : shellFlatCavitySpan(OUTER_SIZE);
  return computeShowcaseFramingRadius(ctx.camera, photoExtent, fill);
}

/** Distance so the jewel cube fills the viewport (uses vertical + horizontal FOV). */
export function computeShowcaseFramingRadius(
  camera: ArcRotateCamera,
  outerSize = OUTER_SIZE,
  viewportFill = 0.8
): number {
  const fovY = camera.fov;
  const engine = camera.getEngine();
  const aspect = engine.getRenderWidth() / Math.max(engine.getRenderHeight(), 1);
  const fovX = 2 * Math.atan(Math.tan(fovY / 2) * aspect);
  const padded = outerSize * 1.05;
  const forHeight = padded / (2 * viewportFill * Math.tan(fovY / 2));
  const forWidth = padded / (2 * viewportFill * Math.tan(fovX / 2));
  return Math.max(2.25, Math.min(7.5, Math.max(forHeight, forWidth)));
}

export function getCubeTrackPosition(ctx: ShowcaseStageContext): Vector3 {
  return ctx.rig?.collider.getAbsolutePosition().clone() ?? ctx.config.showcaseCenter.clone();
}

/** ArcRotate offset: target → camera (Babylon convention). */
export function computeArcCameraOffset(
  alpha: number,
  beta: number,
  radius: number
): Vector3 {
  const sinB = Math.sin(beta);
  return new Vector3(
    radius * Math.cos(alpha) * sinB,
    radius * Math.cos(beta),
    radius * Math.sin(alpha) * sinB
  );
}

/** Y rotation so cube +Z faces `to` in the XZ plane. */
export function computeYawTowardPoint(from: Vector3, to: Vector3): number {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  if (dx * dx + dz * dz < 1e-8) {
    return 0;
  }
  return Math.atan2(dx, dz);
}

export function computeYawTowardCamera(
  cubePosition: Vector3,
  camera: ArcRotateCamera,
  faceOffsetRadians = 0
): number {
  return computeYawTowardPoint(cubePosition, camera.position) + faceOffsetRadians;
}

export function getHeroCameraPose(config: ShowcasePipelineConfig): {
  alpha: number;
  beta: number;
  fill: number;
} {
  return {
    alpha: config.pullHeroCameraAlpha,
    beta: config.pullHeroCameraBeta,
    fill: HOLOGRAM_DISPLAY_SPEC.pullPhotoViewportFill,
  };
}

/** Yaw that squares the photo to the dedicated hero camera slot. */
export function computeYawForHeroFraming(
  cubePosition: Vector3,
  config: ShowcasePipelineConfig,
  camera: ArcRotateCamera,
  framingExtent = OUTER_SIZE
): number {
  const pose = getHeroCameraPose(config);
  const radius = computeShowcaseFramingRadius(camera, framingExtent, pose.fill);
  const cameraPosition = cubePosition.add(
    computeArcCameraOffset(pose.alpha, pose.beta, radius)
  );
  return (
    computeYawTowardPoint(cubePosition, cameraPosition) +
    config.presentationFaceOffsetRadians
  );
}

/** Stable center for hero hold — aerial anchor, no sway while squaring to camera. */
export function getPullHeroCubePosition(config: ShowcasePipelineConfig): Vector3 {
  return getShowcaseAerialAnchor(config, 0);
}

function computeGroundAwareBeta(
  cubeY: number,
  config: ShowcasePipelineConfig,
  profile: ShowcaseCameraProfile
): number {
  const floatY = config.showcaseCenter.y;
  const floorY = config.jewelRestCenterY;
  const span = Math.max(floatY - floorY, 0.35);
  const groundBlend = clamp01((floatY - cubeY) / span);

  const betaAir = config.showcaseCameraBeta;
  const betaGround =
    profile === "fall" ? config.cameraFallBetaGround : config.cameraBounceBetaGround;

  return betaAir + (betaGround - betaAir) * groundBlend;
}

function getCameraLookTarget(
  cubePos: Vector3,
  config: ShowcasePipelineConfig,
  profile: ShowcaseCameraProfile
): Vector3 {
  if (profile === "presentation") {
    return cubePos;
  }

  const floatY = config.showcaseCenter.y;
  const floorY = config.jewelRestCenterY;
  const span = Math.max(floatY - floorY, 0.35);
  const groundBlend = clamp01((floatY - cubePos.y) / span);
  const lift = OUTER_SIZE * 0.38 * groundBlend;
  return new Vector3(cubePos.x, cubePos.y + lift, cubePos.z);
}

/** Gentle zoom breathing while floating (presentation). Disabled during MP4 export. */
function computePresentationFramingFill(
  config: ShowcasePipelineConfig,
  totalElapsedMs: number,
  prefs: ShowcasePresentationPreferences,
  exportRecording = false
): number {
  if (exportRecording || !prefs.zoomBreathingEnabled) {
    return config.cameraFloatFramingFill;
  }
  const periodSec = Math.max(prefs.zoomBreathingPeriodMs, 4_000) / 1000;
  const phase = (totalElapsedMs * 0.001 * Math.PI * 2) / periodSec;
  const breath = Math.sin(phase) * prefs.zoomBreathingAmplitude;
  return config.cameraFloatFramingFill + breath;
}

export type ShowcaseCameraFollowTarget = "anchor" | "cube";

export function tickShowcaseCameraFollow(
  ctx: ShowcaseStageContext,
  dtMs: number,
  profile: ShowcaseCameraProfile = "presentation",
  followTarget: ShowcaseCameraFollowTarget = "anchor"
): void {
  const cam = ctx.camera;
  const config = ctx.config;
  const trackCube = profile !== "presentation" || followTarget === "cube";
  const cubePos = trackCube
    ? getCubeTrackPosition(ctx)
    : getShowcaseAerialAnchor(config, ctx.totalElapsedMs);
  const lookTarget = getCameraLookTarget(cubePos, config, profile);

  const dtSec = Math.min(0.05, Math.max(0.001, dtMs * 0.001));
  const spring = getSpring(cam);
  const smoothMs =
    profile === "presentation" ? config.cameraTargetSmoothMs : config.cameraFallSmoothMs;
  const stiffness = 48_000 / Math.max(smoothMs, 60);
  const damping = 2 * Math.sqrt(stiffness) * 0.92;
  const trackCubeCenter = profile === "presentation" && followTarget === "cube";
  const exportStable = ctx.exportRecording;
  const yStiffness = trackCubeCenter && !exportStable ? stiffness * 1.08 : stiffness;
  const springDamping = exportStable ? damping * 1.18 : damping;

  // Target spring (vector).
  const ax = (lookTarget.x - cam.target.x) * stiffness - spring.targetVel.x * springDamping;
  const ay = (lookTarget.y - cam.target.y) * yStiffness - spring.targetVel.y * springDamping;
  const az = (lookTarget.z - cam.target.z) * stiffness - spring.targetVel.z * springDamping;
  spring.targetVel.x += ax * dtSec;
  spring.targetVel.y += ay * dtSec;
  spring.targetVel.z += az * dtSec;
  cam.setTarget(
    new Vector3(
      cam.target.x + spring.targetVel.x * dtSec,
      cam.target.y + spring.targetVel.y * dtSec,
      cam.target.z + spring.targetVel.z * dtSec
    )
  );

  let fill = config.cameraFramingFill;
  let beta = config.showcaseCameraBeta;

  if (profile === "presentation") {
    // 부상·부유 — optional breathe zoom (off during export for stable framing).
    fill = computePresentationFramingFill(
      config,
      ctx.totalElapsedMs,
      ctx.presentationPrefs,
      ctx.exportRecording
    );
  } else if (profile === "fall") {
    // 낙하 — 줌인.
    fill = config.cameraFallFramingFill;
    beta = computeGroundAwareBeta(cubePos.y, config, "fall");
  } else if (profile === "bounce") {
    // 착지 후 — 부유 프레이밍으로 복귀.
    const blend = clamp01(ctx.phaseElapsedMs / 900);
    fill =
      config.cameraFallFramingFill +
      (config.cameraFloatFramingFill - config.cameraFallFramingFill) * blend;
    beta = computeGroundAwareBeta(cubePos.y, config, "bounce");
  }

  const targetRadius = computeShowcaseFramingRadius(cam, getFramingExtent(ctx), fill);
  const r = springScalar(cam.radius, targetRadius, spring.radiusVel, dtSec, stiffness, springDamping);
  spring.radiusVel = r.vel;
  cam.radius = r.value;

  const a = springAngle(cam.alpha, config.showcaseCameraAlpha, spring.alphaVel, dtSec, stiffness, springDamping);
  spring.alphaVel = a.vel;
  cam.alpha = a.value;

  const b = springScalar(cam.beta, beta, spring.betaVel, dtSec, stiffness, springDamping);
  spring.betaVel = b.vel;
  cam.beta = b.value;
}

/** Hero pull — smooth orbit + zoom from the live camera pose (no snap-back). */
export function tickShowcaseCameraPull(
  ctx: ShowcaseStageContext,
  dtMs: number,
  emphasis: number
): void {
  const cam = ctx.camera;
  const config = ctx.config;
  const cubePos = getCubeTrackPosition(ctx);
  const e = easeInOutCubic(emphasis);
  const dtSec = Math.min(0.05, Math.max(0.001, dtMs * 0.001));
  const spring = getSpring(cam);
  const stiffness = 52_000 / Math.max(config.pullTargetSmoothMs, 80);
  const damping = 2 * Math.sqrt(stiffness) * 0.95;

  // Target spring to cube center during pull.
  const ax = (cubePos.x - cam.target.x) * stiffness - spring.targetVel.x * damping;
  const ay = (cubePos.y - cam.target.y) * stiffness - spring.targetVel.y * damping;
  const az = (cubePos.z - cam.target.z) * stiffness - spring.targetVel.z * damping;
  spring.targetVel.x += ax * dtSec;
  spring.targetVel.y += ay * dtSec;
  spring.targetVel.z += az * dtSec;
  cam.setTarget(
    new Vector3(
      cam.target.x + spring.targetVel.x * dtSec,
      cam.target.y + spring.targetVel.y * dtSec,
      cam.target.z + spring.targetVel.z * dtSec
    )
  );

  const startRadius = ctx.stageState.pullZoomStartRadius as number | undefined;
  const startAlpha = ctx.stageState.pullZoomStartAlpha as number | undefined;
  const startBeta = ctx.stageState.pullZoomStartBeta as number | undefined;
  const heroAlpha = config.pullHeroCameraAlpha;
  const heroBeta = config.pullHeroCameraBeta;
  const targetRadius = getPullPhotoFramingRadius(ctx);

  const desiredRadius =
    startRadius !== undefined
      ? startRadius + (targetRadius - startRadius) * e
      : targetRadius;
  const r = springScalar(cam.radius, desiredRadius, spring.radiusVel, dtSec, stiffness, damping);
  spring.radiusVel = r.vel;
  cam.radius = r.value;

  const fromAlpha = startAlpha ?? cam.alpha;
  const fromBeta = startBeta ?? cam.beta;
  const desiredAlpha = lerpAngle(fromAlpha, heroAlpha, e);
  const desiredBeta = fromBeta + (heroBeta - fromBeta) * e;
  const a = springAngle(cam.alpha, desiredAlpha, spring.alphaVel, dtSec, stiffness, damping);
  spring.alphaVel = a.vel;
  cam.alpha = a.value;

  const b = springScalar(cam.beta, desiredBeta, spring.betaVel, dtSec, stiffness, damping);
  spring.betaVel = b.vel;
  cam.beta = b.value;
}

/** Freeze presentation orbit at ascend enter — avoids zoom-out jerk from moving breathe target. */
export function captureAscendReturnTargets(ctx: ShowcaseStageContext): void {
  const cam = ctx.camera;
  const config = ctx.config;
  const fill = computePresentationFramingFill(
    config,
    ctx.totalElapsedMs,
    ctx.presentationPrefs,
    ctx.exportRecording
  );
  ctx.stageState.returnEndRadius = computeShowcaseFramingRadius(
    cam,
    getFramingExtent(ctx),
    fill
  );
  const cubePos = getCubeTrackPosition(ctx);
  ctx.stageState.returnEndTarget = {
    x: cubePos.x,
    y: cubePos.y,
    z: cubePos.z,
  };
}

/** Return from hero back to floating presentation — timeline ease only (no spring chase). */
export function tickShowcaseCameraReturn(
  ctx: ShowcaseStageContext,
  _dtMs: number,
  progress01: number
): void {
  const cam = ctx.camera;
  const config = ctx.config;
  const e = easeInOutCubic(progress01);

  const endTarget = ctx.stageState.returnEndTarget as
    | { x: number; y: number; z: number }
    | undefined;
  const startTarget = ctx.stageState.returnStartTarget as
    | { x: number; y: number; z: number }
    | undefined;
  if (startTarget && endTarget) {
    cam.setTarget(
      Vector3.Lerp(
        new Vector3(startTarget.x, startTarget.y, startTarget.z),
        new Vector3(endTarget.x, endTarget.y, endTarget.z),
        e
      )
    );
  } else if (endTarget) {
    cam.setTarget(new Vector3(endTarget.x, endTarget.y, endTarget.z));
  } else {
    cam.setTarget(getCubeTrackPosition(ctx));
  }

  const fromRadius = ctx.stageState.returnStartRadius as number | undefined;
  const fromAlpha = ctx.stageState.returnStartAlpha as number | undefined;
  const fromBeta = ctx.stageState.returnStartBeta as number | undefined;
  const toRadius =
    (ctx.stageState.returnEndRadius as number | undefined) ??
    computeShowcaseFramingRadius(cam, getFramingExtent(ctx), config.cameraFloatFramingFill);

  cam.radius = (fromRadius ?? cam.radius) + (toRadius - (fromRadius ?? cam.radius)) * e;
  cam.alpha = lerpAngle(fromAlpha ?? cam.alpha, config.showcaseCameraAlpha, e);
  cam.beta = (fromBeta ?? cam.beta) + (config.showcaseCameraBeta - (fromBeta ?? cam.beta)) * e;
}

export function bindShowcaseCameraToCube(
  camera: ArcRotateCamera,
  config: ShowcasePipelineConfig,
  cubePosition: Vector3,
  framingExtent = OUTER_SIZE
): void {
  camera.setTarget(cubePosition);
  camera.radius = computeShowcaseFramingRadius(
    camera,
    framingExtent,
    config.cameraFloatFramingFill
  );
  camera.alpha = config.showcaseCameraAlpha;
  camera.beta = config.showcaseCameraBeta;
}

export function configureShowcaseArcCamera(camera: ArcRotateCamera): void {
  camera.lowerRadiusLimit = 2.1;
  camera.upperRadiusLimit = 8.5;
  camera.wheelPrecision = 45;
  camera.panningSensibility = 0;
  camera.fov = 0.58;
  camera.minZ = 0.15;
  camera.lowerBetaLimit = 0.52;
  camera.upperBetaLimit = 1.54;
}
