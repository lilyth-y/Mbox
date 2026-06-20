import { HOLOGRAM_DISPLAY_SPEC } from "@mbox/shared";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { JewelCubePhysicsRig } from "../babylon/jewelCubeFactory";
import type { JewelPhotoCoreLayer } from "../babylon/jewelPhotoCore";
import { tickHoloOptics } from "../babylon/holoOptics";
import { tickJewelCrystalShellMaterial } from "../babylon/shaders/jewelCrystalShellShader";
import { tickJewelPhotoCoreLayers } from "../babylon/jewelPhotoCore";
import { tickShowcaseShellGlow } from "../babylon/showcaseShellGlow";
import type { ShowcaseJewelLightingRig } from "../babylon/showcaseJewelLighting";
import type { ShowcasePipelineStageId, ShowcaseStageContext } from "./types";

let jewelLighting: ShowcaseJewelLightingRig | null = null;

export function bindShowcaseJewelLighting(rig: ShowcaseJewelLightingRig | null): void {
  jewelLighting = rig;
}

export function computeHoloDisplayPower(
  stageId: ShowcasePipelineStageId,
  phaseElapsedMs: number
): number {
  if (stageId === "reveal") {
    return Math.min(1, phaseElapsedMs / HOLOGRAM_DISPLAY_SPEC.revealPowerRampMs);
  }
  if (stageId === "fall" || stageId === "bounce") {
    return 0.55;
  }
  if (stageId === "pull") {
    return 1;
  }
  return 1;
}

export function resetHoloDepthParallax(rig: JewelCubePhysicsRig): void {
  const layers: JewelPhotoCoreLayer[] = [rig.bgLayerA, rig.bgLayerB];
  if (rig.fgLayerA) {
    layers.push(rig.fgLayerA);
  }
  if (rig.fgLayerB) {
    layers.push(rig.fgLayerB);
  }

  for (const layer of layers) {
    for (const face of layer.faces) {
      const baseZ = face.metadata?.parallaxBaseZ;
      if (typeof baseZ === "number") {
        face.position.z = baseZ;
      }
    }
  }
}

export function applyHoloDepthParallax(
  rig: JewelCubePhysicsRig,
  cameraPos: Vector3,
  strength: number
): void {
  if (strength <= 0.01) {
    resetHoloDepthParallax(rig);
    return;
  }
  const maxShift = 0.014 * strength;
  const layers: JewelPhotoCoreLayer[] = [rig.bgLayerA, rig.bgLayerB];
  if (rig.fgLayerA) {
    layers.push(rig.fgLayerA);
  }
  if (rig.fgLayerB) {
    layers.push(rig.fgLayerB);
  }

  for (const layer of layers) {
    const isFg = layer === rig.fgLayerA || layer === rig.fgLayerB;
    for (const face of layer.faces) {
      const group = face.parent;
      if (!group) {
        continue;
      }
      const baseZ =
        typeof face.metadata?.parallaxBaseZ === "number"
          ? face.metadata.parallaxBaseZ
          : face.position.z;
      if (typeof face.metadata?.parallaxBaseZ !== "number") {
        face.metadata = { ...face.metadata, parallaxBaseZ: baseZ };
      }

      const worldNormal = Vector3.TransformNormal(
        new Vector3(0, 0, 1),
        group.getWorldMatrix()
      ).normalize();
      const facePos = face.getAbsolutePosition();
      const toCam = cameraPos.subtract(facePos);
      if (toCam.lengthSquared() < 1e-8) {
        continue;
      }
      toCam.normalize();
      const facing = Math.max(0, Vector3.Dot(worldNormal, toCam));
      const shift = facing * maxShift * (isFg ? 1.4 : 1.0);
      face.position.z = baseZ + shift;
    }
  }
}

export function tickHoloDisplayStack(
  ctx: ShowcaseStageContext,
  dtMs: number,
  parallaxStrength = 1
): void {
  if (!ctx.rig) {
    return;
  }
  const power = computeHoloDisplayPower(ctx.stageId, ctx.phaseElapsedMs);
  ctx.rig.holoPower = power;
  ctx.rig.fxTimeSec += dtMs * 0.001;
  tickHoloOptics(ctx.rig.holoOptics, dtMs, power);
  const anchor = ctx.rig.collider.getAbsolutePosition();

  if (jewelLighting) {
    jewelLighting.setAnchor(anchor);
    jewelLighting.tick(
      ctx.rig.fxTimeSec,
      power,
      ctx.rig.shapeId,
      ctx.rig.photoLayout
    );
  }

  const lightSnapshot = jewelLighting?.getShellLightSnapshot();
  tickJewelCrystalShellMaterial(
    ctx.rig.shellMaterial,
    ctx.rig.fxTimeSec,
    power,
    lightSnapshot,
    ctx.rig.shellInnerMaterial,
    ctx.rig.shapeId
  );
  tickJewelPhotoCoreLayers(ctx.rig, lightSnapshot, ctx.camera.globalPosition);
  tickShowcaseShellGlow(power, ctx.stageId, ctx.rig.shapeId);
  applyHoloDepthParallax(ctx.rig, ctx.camera.globalPosition, parallaxStrength * power);
}
