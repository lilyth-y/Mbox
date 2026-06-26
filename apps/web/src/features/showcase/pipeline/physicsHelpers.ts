import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { PhysicsMotionType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";
import type { JewelCubePhysicsRig } from "../babylon/jewelCubeFactory";
import type { PresentationSpinDirection } from "./showcasePresentationPreferences";

const WORLD_UP = Vector3.Up();
const PRESENTATION_PITCH_CLAMP_RAD = 0.11;

export interface CompoundSpinAxisWeights {
  x: number;
  y: number;
  z: number;
}

/** Yaw from forward projected on XZ — stable while pitch wobbles. */
export function extractJewelCubeYaw(q: Quaternion): number {
  const forward = Vector3.Forward().applyRotationQuaternion(q);
  return Math.atan2(forward.x, forward.z);
}

function readJewelCubePitch(q: Quaternion): number {
  return q.toEulerAngles().x;
}

export function getJewelCubePitchRadians(rig: JewelCubePhysicsRig): number {
  const q = rig.collider.rotationQuaternion;
  return q ? readJewelCubePitch(q) : 0;
}

/** Rebuild pose with roll locked to zero — keeps cube photos from shearing. */
export function buildJewelCubeUprightRotation(yaw: number, pitch: number): Quaternion {
  const clampedPitch = Math.max(
    -PRESENTATION_PITCH_CLAMP_RAD,
    Math.min(PRESENTATION_PITCH_CLAMP_RAD, pitch)
  );
  return Quaternion.RotationYawPitchRoll(yaw, clampedPitch, 0);
}

function ensureColliderQuaternion(rig: JewelCubePhysicsRig): Quaternion {
  const collider = rig.collider;
  if (!collider.rotationQuaternion) {
    collider.rotationQuaternion = Quaternion.Identity();
  }
  return collider.rotationQuaternion;
}

export function syncJewelCubePhysicsTransform(rig: JewelCubePhysicsRig): void {
  const body = rig.aggregate.body;
  const collider = rig.collider;
  const rot = ensureColliderQuaternion(rig);
  body.setMotionType(PhysicsMotionType.ANIMATED);
  body.setTargetTransform(collider.getAbsolutePosition(), rot);
  body.setLinearVelocity(Vector3.Zero());
  body.setAngularVelocity(Vector3.Zero());
}

export function holdJewelCubeAt(
  rig: JewelCubePhysicsRig,
  target: Vector3,
  stiffness = 18
): void {
  const pos = rig.collider.getAbsolutePosition();
  const blend = Math.min(0.42, stiffness * 0.012);
  const next = Vector3.Lerp(pos, target, blend);
  rig.collider.position.copyFrom(next);
  syncJewelCubePhysicsTransform(rig);
}

export function getJewelCubeYawRadians(rig: JewelCubePhysicsRig): number {
  const q = rig.collider.rotationQuaternion;
  if (!q) {
    return 0;
  }
  return extractJewelCubeYaw(q);
}

/** Set cube Y rotation without teleporting position. */
export function setJewelCubeYaw(rig: JewelCubePhysicsRig, yaw: number): void {
  const nextRot = buildJewelCubeUprightRotation(yaw, 0);
  rig.collider.rotationQuaternion = rig.collider.rotationQuaternion ?? nextRot.clone();
  rig.collider.rotationQuaternion.copyFrom(nextRot);
  syncJewelCubePhysicsTransform(rig);
}

/** Smooth yaw + pitch toward targets — roll stays locked. */
export function blendJewelCubeUprightToward(
  rig: JewelCubePhysicsRig,
  targetYaw: number,
  targetPitch: number,
  dtMs: number,
  yawRateRadPerSec = 3.2,
  pitchRateRadPerSec = 2.8
): void {
  const dt = dtMs * 0.001;
  const currentYaw = getJewelCubeYawRadians(rig);
  const currentPitch = getJewelCubePitchRadians(rig);

  let deltaYaw = targetYaw - currentYaw;
  while (deltaYaw > Math.PI) {
    deltaYaw -= Math.PI * 2;
  }
  while (deltaYaw < -Math.PI) {
    deltaYaw += Math.PI * 2;
  }
  const yawStep = Math.sign(deltaYaw) * Math.min(Math.abs(deltaYaw), yawRateRadPerSec * dt);

  const deltaPitch = targetPitch - currentPitch;
  const pitchStep =
    Math.sign(deltaPitch) * Math.min(Math.abs(deltaPitch), pitchRateRadPerSec * dt);

  const nextRot = buildJewelCubeUprightRotation(
    currentYaw + yawStep,
    currentPitch + pitchStep
  );
  rig.collider.rotationQuaternion = rig.collider.rotationQuaternion ?? nextRot.clone();
  rig.collider.rotationQuaternion.copyFrom(nextRot);
  syncJewelCubePhysicsTransform(rig);
}

/** Kinematic world-Y spin — quaternion integration, roll/pitch locked. */
export function spinJewelCubeY(
  rig: JewelCubePhysicsRig,
  speedY: number,
  dtMs = 16.67,
  spinSign: 1 | -1 = 1
): void {
  if (Math.abs(speedY) < 1e-6) {
    rig.aggregate.body.setAngularVelocity(Vector3.Zero());
    return;
  }

  const q = ensureColliderQuaternion(rig);
  const delta = Quaternion.RotationAxis(WORLD_UP, spinSign * speedY * (dtMs * 0.001));
  const spun = delta.multiply(q);
  const nextRot = buildJewelCubeUprightRotation(extractJewelCubeYaw(spun), 0);
  q.copyFrom(nextRot);
  syncJewelCubePhysicsTransform(rig);
}
/** Teleport rig and sync Havok body — preserves upright pose when rotation omitted. */
export function repositionJewelCube(
  rig: JewelCubePhysicsRig,
  position: Vector3,
  rotation?: Quaternion
): void {
  const body = rig.aggregate.body;
  const rot =
    rotation ??
    rig.collider.rotationQuaternion?.clone() ??
    Quaternion.Identity();

  rig.collider.position.copyFrom(position);
  if (!rig.collider.rotationQuaternion) {
    rig.collider.rotationQuaternion = rot.clone();
  } else {
    rig.collider.rotationQuaternion.copyFrom(rot);
  }

  body.setTargetTransform(rig.collider.position, rig.collider.rotationQuaternion);
  body.setLinearVelocity(Vector3.Zero());
  body.setAngularVelocity(Vector3.Zero());
  body.setMotionType(PhysicsMotionType.DYNAMIC);
}

/** Presentation spin — world Y for 좌/우, gentle pitch for 상/하. */
export function applyJewelCubeSpinStep(
  rig: JewelCubePhysicsRig,
  direction: PresentationSpinDirection,
  speedRadPerSec: number,
  dtMs: number,
  pitchUprightScale = 1
): void {
  const dt = dtMs * 0.001;
  const step = Math.abs(speedRadPerSec) * dt;
  const q = ensureColliderQuaternion(rig);
  let spun = q.clone();

  switch (direction) {
    case "left":
      spun = Quaternion.RotationAxis(WORLD_UP, step).multiply(q);
      break;
    case "right":
      spun = Quaternion.RotationAxis(WORLD_UP, -step).multiply(q);
      break;
    case "up":
      spun = Quaternion.RotationAxis(WORLD_UP, step * 0.45).multiply(q);
      break;
    case "down":
      spun = Quaternion.RotationAxis(WORLD_UP, -step * 0.45).multiply(q);
      break;
  }

  const yaw = extractJewelCubeYaw(spun);
  let pitch = readJewelCubePitch(q);
  switch (direction) {
    case "left":
    case "right":
      pitch *= 0.9;
      break;
    case "up":
      pitch = Math.min(PRESENTATION_PITCH_CLAMP_RAD, pitch + step * 0.55);
      break;
    case "down":
      pitch = Math.max(-PRESENTATION_PITCH_CLAMP_RAD, pitch - step * 0.55);
      break;
  }

  pitch *= Math.max(0, Math.min(1, pitchUprightScale));

  q.copyFrom(buildJewelCubeUprightRotation(yaw, pitch));
  syncJewelCubePhysicsTransform(rig);
}

/**
 * Compound presentation — smooth world-Y cruise + oscillating pitch (no roll).
 * Pitch wobbles instead of accumulating so photos stay proportional.
 */
export function applyJewelCubeCompoundSpinStep(
  rig: JewelCubePhysicsRig,
  speedMag: number,
  weights: CompoundSpinAxisWeights,
  presentationCycle: number,
  totalElapsedMs: number,
  dtMs: number,
  pitchWobbleScale = 1
): void {
  const dt = dtMs * 0.001;
  const q = ensureColliderQuaternion(rig);
  const spun = Quaternion.RotationAxis(WORLD_UP, weights.y * speedMag * dt).multiply(q);
  const yaw = extractJewelCubeYaw(spun);
  const seed = presentationCycle * 2.399963 + 0.173;
  const t = totalElapsedMs * 0.001;
  const wobble = weights.x * 0.1 * Math.sin(t * 0.9 + seed) * Math.max(0, pitchWobbleScale);
  const retainedPitch = readJewelCubePitch(q) * (1 - Math.max(0, pitchWobbleScale));
  const pitch = retainedPitch + wobble;
  q.copyFrom(buildJewelCubeUprightRotation(yaw, pitch));
  syncJewelCubePhysicsTransform(rig);
}