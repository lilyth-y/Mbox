import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { OUTER_SIZE } from "../babylon/jewelCubeMaterials";
import { computeShowcaseFramingRadius } from "./showcaseCamera";
import type { ShowcasePipelineConfig } from "./types";

export type ShowcaseAerialMotionMode = "fixed" | "gentle";

/** Vertical offset from cube target to camera (Babylon ArcRotate convention). */
export function computeCameraVerticalOffset(radius: number, beta: number): number {
  return radius * Math.cos(beta);
}

/** Cube center Y so the presentation camera sits at `eyeHeightY`. */
export function computeAnchorYForEyeHeight(
  eyeHeightY: number,
  radius: number,
  beta: number,
  minY: number
): number {
  const y = eyeHeightY - computeCameraVerticalOffset(radius, beta);
  return Math.max(minY, y);
}

export function cloneShowcasePipelineConfig(
  source: ShowcasePipelineConfig
): ShowcasePipelineConfig {
  return {
    ...source,
    showcaseCenter: source.showcaseCenter.clone(),
  };
}

/**
 * Derive aerial hold height from viewer eye line + presentation orbit.
 * Mutates `config.showcaseCenter.y` (XZ stay at booth center).
 */
export function calibrateShowcaseAerialAnchor(
  config: ShowcasePipelineConfig,
  camera: ArcRotateCamera
): Vector3 {
  const radius = computeShowcaseFramingRadius(
    camera,
    OUTER_SIZE,
    config.cameraFloatFramingFill
  );
  config.showcaseCenter.x = 0;
  config.showcaseCenter.z = 0;
  config.showcaseCenter.y = computeAnchorYForEyeHeight(
    config.viewerEyeHeightY,
    radius,
    config.showcaseCameraBeta,
    config.minAerialCenterY
  );
  return config.showcaseCenter.clone();
}

/**
 * World anchor for the floating jewel — attach future VFX / holo props here.
 * `fixed` = exact aerial slot; `gentle` = subtle bob on top.
 */
export function getShowcaseAerialAnchor(
  config: ShowcasePipelineConfig,
  elapsedMs = 0
): Vector3 {
  const base = config.showcaseCenter;
  if (config.aerialMotionMode === "fixed") {
    return base.clone();
  }

  const t = elapsedMs * 0.001;
  const periodSec = Math.max(config.floatPeriodMs, 400) / 1000;
  const bobY = Math.sin((t * Math.PI * 2) / periodSec) * config.floatAmplitudeY * 0.35;
  const swayX = Math.sin(t * 1.15 + 0.4) * config.floatSwayX * 0.4;
  const swayZ = Math.cos(t * 0.92 + 0.2) * config.floatSwayZ * 0.4;
  return new Vector3(base.x + swayX, base.y + bobY, base.z + swayZ);
}
