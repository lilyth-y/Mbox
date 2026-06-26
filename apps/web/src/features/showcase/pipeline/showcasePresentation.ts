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

  blendJewelCubeUprightToward,

  getJewelCubeYawRadians,

  holdJewelCubeAt,

  repositionJewelCube,

} from "./physicsHelpers";

import { updateCubePhotoFaceVisibility } from "../babylon/jewelPhotoCore";

import { getShowcaseAerialAnchor } from "./showcaseAerialAnchor";

import {
  easeInOutUniformAccel,
  easeOutUniformDecel,
  computeIntegralEaseInCruiseSpinSpeedY,
  computeSpinDecayTargetSpeedY,
} from "./showcaseSpinMotion";
import { applySmoothedPresentationSpin, presentationSpinAllowsTilt } from "./showcasePresentationSpin";
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
export { resolveShowcaseSpinSign } from "./showcaseSpinMotion";



/** Damp pitch/roll spin — presentation stays upright while Y rotates. */

export function enforceJewelCubeUpright(
  rig: JewelCubePhysicsRig,
  allowPitch = false
): void {

  const body = rig.aggregate.body as {
    getAngularVelocity?: () => Vector3;
    setAngularVelocity?: (v: Vector3) => void;
  };

  if (typeof body.getAngularVelocity !== "function") {
    return;
  }

  const av = body.getAngularVelocity();

  if (allowPitch) {
    if (Math.abs(av.z) > 1e-5 && typeof body.setAngularVelocity === "function") {
      body.setAngularVelocity(new Vector3(av.x, av.y, 0));
    }
  } else if (Math.abs(av.x) > 1e-5 || Math.abs(av.z) > 1e-5) {

    if (typeof body.setAngularVelocity === "function") {
      body.setAngularVelocity(new Vector3(0, av.y, 0));
    }

  }

}



export interface ShowcasePresentationTickOptions {

  spinSpeedY: number;

  spinSign?: 1 | -1;

  holdStiffness?: number;

  parallaxStrength?: number;

  /** Scales compound wobble / cardinal pitch during pull decel (1 = full). */
  pitchWobbleScale?: number;

  /** When set, overrides aerial float (e.g. ground→air lift after bounce). */
  holdPosition?: Vector3;

  /** Track the rig collider — keeps camera on the whole jewel assembly. */
  followTarget?: "anchor" | "cube";

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



  tickShowcaseCameraFollow(
    ctx,
    dtMs,
    "presentation",
    ctx.exportRecording ? "anchor" : (options.followTarget ?? "cube")
  );

  const floatTarget =
    options.holdPosition ?? getShowcaseFloatPosition(ctx.config, ctx.totalElapsedMs);

  const baseStiffness = options.holdStiffness ?? ctx.config.floatHoldStiffness;
  const holdStiffness = baseStiffness;

  applySmoothedPresentationSpin(
    ctx,
    dtMs,
    options.spinSpeedY,
    options.pitchWobbleScale ?? 1
  );

  holdJewelCubeAt(ctx.rig, floatTarget, holdStiffness);

  enforceJewelCubeUpright(ctx.rig, presentationSpinAllowsTilt(ctx));

  const parallaxStrength =
    ctx.rig.photoLayout === "cube" ? 0 : (options.parallaxStrength ?? 0.35);
  tickHoloDisplayStack(ctx, dtMs, parallaxStrength);

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
 * Integral-mapped Y spin — constant angular acceleration / deceleration (등가속도).
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
  const deltaYaw = totalYaw * (easeInOutUniformAccel(t1) - easeInOutUniformAccel(t0));
  return deltaYaw / (dtMs * 0.001);
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
  const deltaYaw = totalYaw * (easeOutUniformDecel(t1) - easeOutUniformDecel(t0));
  return deltaYaw / (dtMs * 0.001);
}

/** Ease jewel from floor rest to aerial float during morph (post-bounce). */
export function resolveMorphHoldPosition(
  ctx: ShowcaseStageContext,
  morphPhaseElapsedMs = ctx.phaseElapsedMs
): Vector3 {
  const float = getShowcaseFloatPosition(ctx.config, ctx.totalElapsedMs);
  const startY = ctx.stageState.morphLiftStartY as number | undefined;
  if (startY === undefined) {
    return float;
  }
  const u = clamp01(morphPhaseElapsedMs / Math.max(ctx.config.morphDurationMs, 1));
  const y = startY + (float.y - startY) * easeInOutCubic(u);
  if (u >= 1) {
    delete ctx.stageState.morphLiftStartY;
  }
  return new Vector3(float.x, y, float.z);
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

    tickShowcaseCameraFollow(ctx, dtMs, "presentation", "cube");

  }



  const holdEase =
    ctx.phaseElapsedMs >= pullEnd
      ? clamp01((ctx.phaseElapsedMs - pullEnd) / Math.max(config.pullHoldMs * 0.35, 1))
      : 0;

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

    const entrySpeed =
      typeof ctx.stageState.pullEntrySpinY === "number"
        ? (ctx.stageState.pullEntrySpinY as number)
        : Math.max(Math.abs(ctx.spinOmegaY), config.rotateSpeedY * 0.85);

    const leadTarget = computeSpinDecayTargetSpeedY(
      ctx.phaseElapsedMs,
      Math.max(zoomStartMs, 1),
      entrySpeed
    );
    const pitchFade = clamp01(leadTarget / Math.max(entrySpeed, 1e-4));

    applySmoothedPresentationSpin(ctx, dtMs, leadTarget, pitchFade);

    holdJewelCubeAt(
      ctx.rig,
      cubePos,
      config.floatHoldStiffness * (1 + 0.55 * holdEase)
    );

    enforceJewelCubeUpright(ctx.rig, false);

    updateCubePhotoFaceVisibility(ctx.rig, ctx.camera.globalPosition, false);

  } else {

    capturePullAlignStart(ctx);

    const alignEase = inHoldPhase ? 1 : ease;

    const yaw = lerpAngle(startYaw, targetYaw, alignEase);

    applySmoothedPresentationSpin(ctx, dtMs, 0);

    blendJewelCubeUprightToward(ctx.rig, yaw, 0, dtMs);

    holdJewelCubeAt(
      ctx.rig,
      cubePos,
      config.floatHoldStiffness * (1 + 0.55 * holdEase)
    );

    updateCubePhotoFaceVisibility(

      ctx.rig,

      ctx.camera.globalPosition,

      inHoldPhase || alignEase >= 0.92,

      0.78

    );

  }



  const parallax =
    ctx.rig.photoLayout === "cube" || inHoldPhase || ease >= 0.98
      ? 0
      : 0.12 * (1 - ease) * (1 - ease);

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

  tickShowcaseCameraReturn(ctx, dtMs, t);

  const ascendSpin = computeIntegralEaseInCruiseSpinSpeedY(
    ctx.phaseElapsedMs,
    dtMs,
    config.pullReturnMs,
    config.rotateSpeedY,
    0.32
  );

  applySmoothedPresentationSpin(ctx, dtMs, ascendSpin);

  holdJewelCubeAt(ctx.rig, floatTarget, config.floatHoldStiffness);

  enforceJewelCubeUpright(ctx.rig, presentationSpinAllowsTilt(ctx));

  updateCubePhotoFaceVisibility(ctx.rig, ctx.camera.globalPosition, false);

  tickHoloDisplayStack(
    ctx,
    dtMs,
    ctx.rig.photoLayout === "cube" ? 0 : 0.1 + ease * 0.25
  );



  return t >= 1 ? "complete" : "continue";

}


