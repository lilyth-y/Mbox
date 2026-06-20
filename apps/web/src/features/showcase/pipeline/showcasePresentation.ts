import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";

import type { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";

import type { JewelCubePhysicsRig } from "../babylon/jewelCubeFactory";

import { OUTER_SIZE } from "../babylon/jewelCubeMaterials";

import { getPhotoCrystalFramingExtent } from "../babylon/photoCrystalShapeCatalog";

import { tickHoloDisplayStack } from "./holoDisplayStack";

import {

  computeYawForHeroFraming,

  computeYawTowardCamera,

  getPullHeroCubePosition,

  lerpAngle,

  nearestCardinalYawFrom,

  tickShowcaseCameraFollow,

  tickShowcaseCameraPull,

  tickShowcaseCameraReturn,

} from "./showcaseCamera";

import {

  getJewelCubeYawRadians,

  holdJewelCubeAt,

  repositionJewelCube,

  setJewelCubeYaw,

  spinJewelCubeY,

} from "./physicsHelpers";

import { updateCubePhotoFaceVisibility } from "../babylon/jewelPhotoCore";

import { getShowcaseAerialAnchor } from "./showcaseAerialAnchor";

import type { ShowcasePipelineConfig, ShowcaseStageContext } from "./types";



export function getShowcaseFloatPosition(

  config: ShowcasePipelineConfig,

  elapsedMs: number

): Vector3 {

  return getShowcaseAerialAnchor(config, elapsedMs);

}



export function getFrontFacingQuaternion(

  cubePosition: Vector3,

  camera: ArcRotateCamera,

  config: ShowcasePipelineConfig

): Quaternion {

  const yaw = computeYawTowardCamera(

    cubePosition,

    camera,

    config.presentationFaceOffsetRadians

  );

  return Quaternion.FromEulerAngles(0, yaw, 0);

}



export function getHeroFramingQuaternion(

  cubePosition: Vector3,

  camera: ArcRotateCamera,

  config: ShowcasePipelineConfig,

  rig?: JewelCubePhysicsRig | null

): Quaternion {

  const extent = rig ? getPhotoCrystalFramingExtent(rig.shapeId) : OUTER_SIZE;

  const yaw = computeYawForHeroFraming(cubePosition, config, camera, extent);

  return Quaternion.FromEulerAngles(0, yaw, 0);

}



/** @deprecated use getHeroFramingQuaternion */

export function getPresentationUprightQuaternion(config: ShowcasePipelineConfig): Quaternion {

  return Quaternion.FromEulerAngles(0, config.presentationYawRadians, 0);

}



export { getJewelCubeYawRadians } from "./physicsHelpers";



/** Damp pitch/roll spin — presentation stays upright while Y rotates. */

export function enforceJewelCubeUpright(rig: JewelCubePhysicsRig): void {

  const body = rig.aggregate.body;

  const av = body.getAngularVelocity();

  if (Math.abs(av.x) > 1e-5 || Math.abs(av.z) > 1e-5) {

    body.setAngularVelocity(new Vector3(0, av.y, 0));

  }

}



export interface ShowcasePresentationTickOptions {

  spinSpeedY: number;

  holdStiffness?: number;

  parallaxStrength?: number;

}



/** Floating hold + unidirectional Y spin (morph/rotate/reveal). */

export function tickShowcasePresentation(

  ctx: ShowcaseStageContext,

  dtMs: number,

  options: ShowcasePresentationTickOptions

): void {

  if (!ctx.rig) {

    return;

  }



  tickShowcaseCameraFollow(ctx, dtMs, "presentation");

  const floatTarget = getShowcaseFloatPosition(ctx.config, ctx.totalElapsedMs);

  holdJewelCubeAt(ctx.rig, floatTarget, options.holdStiffness ?? ctx.config.floatHoldStiffness);

  spinJewelCubeY(ctx.rig, options.spinSpeedY, dtMs);

  enforceJewelCubeUpright(ctx.rig);

  tickHoloDisplayStack(ctx, dtMs, options.parallaxStrength ?? 0.35);

}



export function liftJewelCubeToShowcase(ctx: ShowcaseStageContext): void {

  if (!ctx.rig) {

    return;

  }

  const floatPos = getShowcaseFloatPosition(ctx.config, ctx.totalElapsedMs);

  repositionJewelCube(

    ctx.rig,

    floatPos,

    getHeroFramingQuaternion(floatPos, ctx.camera, ctx.config, ctx.rig)

  );

}



function clamp01(value: number): number {

  return Math.max(0, Math.min(1, value));

}



function easeInOutCubic(t: number): number {

  const x = clamp01(t);

  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;

}



/**
 * Integral-mapped Y spin speed — same total yaw as constant peakSpeedY over durationMs,
 * with ease-in-out angular velocity (no snap at phase boundaries).
 */
export function computeIntegralEaseSpinSpeedY(
  phaseElapsedMs: number,
  dtMs: number,
  durationMs: number,
  peakSpeedY: number
): number {
  if (durationMs <= 0 || dtMs <= 0) {
    return 0;
  }
  const totalYaw = Math.abs(peakSpeedY) * (durationMs * 0.001);
  const t0 = phaseElapsedMs / durationMs;
  const t1 = Math.min(1, (phaseElapsedMs + dtMs) / durationMs);
  const deltaYaw = totalYaw * (easeInOutCubic(t1) - easeInOutCubic(t0));
  return deltaYaw / (dtMs * 0.001);
}

function easeOutCubic(t: number): number {
  const x = clamp01(t);
  return 1 - (1 - x) ** 3;
}

/** Lead-phase spin — ease-out to zero at segment end (pull pre-zoom decel). */
export function computeIntegralEaseOutSpinSpeedY(
  phaseElapsedMs: number,
  dtMs: number,
  durationMs: number,
  peakSpeedY: number
): number {
  if (durationMs <= 0 || dtMs <= 0) {
    return 0;
  }
  const totalYaw = Math.abs(peakSpeedY) * (durationMs * 0.001);
  const t0 = phaseElapsedMs / durationMs;
  const t1 = Math.min(1, (phaseElapsedMs + dtMs) / durationMs);
  const deltaYaw = totalYaw * (easeOutCubic(t1) - easeOutCubic(t0));
  return deltaYaw / (dtMs * 0.001);
}



function capturePullZoomStart(ctx: ShowcaseStageContext): void {

  if (ctx.stageState.pullZoomCaptured) {

    return;

  }

  ctx.stageState.pullZoomCaptured = true;

  ctx.stageState.pullZoomStartAlpha = ctx.camera.alpha;

  ctx.stageState.pullZoomStartBeta = ctx.camera.beta;

  ctx.stageState.pullZoomStartRadius = ctx.camera.radius;

}



function capturePullAlignStart(ctx: ShowcaseStageContext): void {

  if (!ctx.rig || ctx.stageState.pullAlignCaptured) {

    return;

  }

  ctx.stageState.pullAlignCaptured = true;

  ctx.stageState.pullAlignStartYaw = getJewelCubeYawRadians(ctx.rig);

}



/**

 * Post-morph hero beat: spin + zoom continue until max size, then hold still.

 */

export function tickShowcasePullEmphasis(

  ctx: ShowcaseStageContext,

  dtMs: number

): "continue" | "complete" {

  if (!ctx.rig) {

    return "complete";

  }



  const config = ctx.config;

  const lead = config.pullSpinLeadMs;

  const zoomStartMs = lead * config.pullZoomLeadOverlap;

  const zoomDuration = lead - zoomStartMs + config.pullDurationMs;

  const pullEnd = zoomStartMs + zoomDuration;

  const total = pullEnd + config.pullHoldMs;

  const heroPos = getPullHeroCubePosition(config);

  const floatPos = getShowcaseFloatPosition(config, ctx.totalElapsedMs);



  const zoomT =

    ctx.phaseElapsedMs < zoomStartMs

      ? 0

      : clamp01((ctx.phaseElapsedMs - zoomStartMs) / Math.max(zoomDuration, 1));

  const ease = easeInOutCubic(zoomT);

  const inHoldPhase = ctx.phaseElapsedMs >= pullEnd;

  const cubePos = inHoldPhase ? heroPos : Vector3.Lerp(floatPos, heroPos, ease);



  if (ctx.phaseElapsedMs >= zoomStartMs) {

    capturePullZoomStart(ctx);

  }



  if (ctx.stageState.pullZoomCaptured) {

    tickShowcaseCameraPull(ctx, dtMs, inHoldPhase ? 1 : zoomT);

  } else {

    tickShowcaseCameraFollow(ctx, dtMs, "presentation");

  }



  const holdEase =
    ctx.phaseElapsedMs >= pullEnd
      ? clamp01((ctx.phaseElapsedMs - pullEnd) / Math.max(config.pullHoldMs * 0.35, 1))
      : 0;

  holdJewelCubeAt(
    ctx.rig,
    cubePos,
    config.floatHoldStiffness * (1 + 0.55 * holdEase)
  );



  const extent = getPhotoCrystalFramingExtent(ctx.rig.shapeId);

  const idealYaw = computeYawForHeroFraming(heroPos, config, ctx.camera, extent);

  const startYaw =

    typeof ctx.stageState.pullAlignStartYaw === "number"

      ? (ctx.stageState.pullAlignStartYaw as number)

      : typeof ctx.stageState.pullStartYaw === "number"

        ? (ctx.stageState.pullStartYaw as number)

        : getJewelCubeYawRadians(ctx.rig);

  const targetYaw =

    ctx.rig.shapeId === "cube" && ctx.rig.photoLayout === "cube"

      ? nearestCardinalYawFrom(startYaw, idealYaw)

      : idealYaw;



  if (ctx.phaseElapsedMs < zoomStartMs) {

    const leadSpin = computeIntegralEaseOutSpinSpeedY(
      ctx.phaseElapsedMs,
      dtMs,
      Math.max(zoomStartMs, 1),
      config.rotateSpeedY
    );

    spinJewelCubeY(ctx.rig, leadSpin, dtMs);

    enforceJewelCubeUpright(ctx.rig);

    updateCubePhotoFaceVisibility(ctx.rig, ctx.camera.globalPosition, false);

  } else {

    capturePullAlignStart(ctx);

    const alignEase = inHoldPhase ? 1 : ease;

    const yaw = lerpAngle(startYaw, targetYaw, alignEase);

    setJewelCubeYaw(ctx.rig, yaw);

    enforceJewelCubeUpright(ctx.rig);

    updateCubePhotoFaceVisibility(

      ctx.rig,

      ctx.camera.globalPosition,

      inHoldPhase || alignEase >= 0.92,

      0.78

    );

  }



  const parallax =
    inHoldPhase || ease >= 0.98 ? 0 : 0.22 * (1 - ease) * (1 - ease);

  tickHoloDisplayStack(ctx, dtMs, parallax);



  return ctx.phaseElapsedMs >= total ? "complete" : "continue";

}



/** Hero zoom-out → presentation float — ease-in-out camera + spin ramp. */

export function tickShowcaseAscendReturn(

  ctx: ShowcaseStageContext,

  dtMs: number

): "continue" | "complete" {

  if (!ctx.rig) {

    return "complete";

  }



  const config = ctx.config;

  const t = clamp01(ctx.phaseElapsedMs / Math.max(config.pullReturnMs, 1));

  const ease = easeInOutCubic(t);

  const floatTarget = getShowcaseFloatPosition(config, ctx.totalElapsedMs);



  holdJewelCubeAt(ctx.rig, floatTarget, config.floatHoldStiffness);

  tickShowcaseCameraReturn(ctx, dtMs, t);

  const ascendSpin = computeIntegralEaseSpinSpeedY(
    ctx.phaseElapsedMs,
    dtMs,
    config.pullReturnMs,
    config.rotateSpeedY
  );

  spinJewelCubeY(ctx.rig, ascendSpin, dtMs);

  enforceJewelCubeUpright(ctx.rig);

  updateCubePhotoFaceVisibility(ctx.rig, ctx.camera.globalPosition, false);

  tickHoloDisplayStack(ctx, dtMs, 0.1 + ease * 0.25);



  return t >= 1 ? "complete" : "continue";

}


