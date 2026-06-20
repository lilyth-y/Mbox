import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { PhysicsMotionType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";
import type { JewelCubePhysicsRig } from "../babylon/jewelCubeFactory";

export function freezeJewelCube(rig: JewelCubePhysicsRig): void {
  const body = rig.aggregate.body;
  body.setMotionType(PhysicsMotionType.DYNAMIC);
  body.setLinearVelocity(Vector3.Zero());
  body.setAngularVelocity(Vector3.Zero());
}

export function holdJewelCubeAt(
  rig: JewelCubePhysicsRig,
  target: Vector3,
  stiffness = 18
): void {
  const body = rig.aggregate.body;
  const pos = rig.collider.getAbsolutePosition();
  const blend = Math.min(0.55, stiffness * 0.014);
  const next = Vector3.Lerp(pos, target, blend);
  rig.collider.position.copyFrom(next);
  const rot = rig.collider.rotationQuaternion;
  if (rot) {
    body.setTargetTransform(next, rot);
  }
  body.setLinearVelocity(Vector3.Zero());
}

export function getJewelCubeYawRadians(rig: JewelCubePhysicsRig): number {
  const q = rig.collider.rotationQuaternion;
  if (!q) {
    return 0;
  }
  return q.toEulerAngles().y;
}

/** Set cube Y rotation without teleporting position. */
export function setJewelCubeYaw(rig: JewelCubePhysicsRig, yaw: number): void {
  const body = rig.aggregate.body;
  const collider = rig.collider;
  const nextRot = Quaternion.FromEulerAngles(0, yaw, 0);
  if (!collider.rotationQuaternion) {
    collider.rotationQuaternion = nextRot.clone();
  } else {
    collider.rotationQuaternion.copyFrom(nextRot);
  }
  body.setAngularVelocity(Vector3.Zero());
  body.setTargetTransform(collider.getAbsolutePosition(), collider.rotationQuaternion);
}

/** Smooth Y rotation toward target — avoids instant reposition snap at hold boundary. */
export function blendJewelCubeYawToward(
  rig: JewelCubePhysicsRig,
  targetYaw: number,
  dtMs: number,
  turnRateRadPerSec = 3.2
): void {
  const body = rig.aggregate.body;
  const collider = rig.collider;
  const currentYaw = getJewelCubeYawRadians(rig);
  const maxStep = turnRateRadPerSec * (dtMs * 0.001);
  let delta = targetYaw - currentYaw;
  while (delta > Math.PI) {
    delta -= Math.PI * 2;
  }
  while (delta < -Math.PI) {
    delta += Math.PI * 2;
  }
  const step = Math.sign(delta) * Math.min(Math.abs(delta), maxStep);
  const nextYaw = currentYaw + step;
  const nextRot = Quaternion.FromEulerAngles(0, nextYaw, 0);
  if (!collider.rotationQuaternion) {
    collider.rotationQuaternion = nextRot.clone();
  } else {
    collider.rotationQuaternion.copyFrom(nextRot);
  }
  body.setAngularVelocity(Vector3.Zero());
  body.setTargetTransform(collider.getAbsolutePosition(), collider.rotationQuaternion);
}

/** Kinematic Y spin — preserves rotation through holdJewelCubeAt each frame. */
export function spinJewelCubeY(
  rig: JewelCubePhysicsRig,
  speedY: number,
  dtMs = 16.67
): void {
  const body = rig.aggregate.body;
  if (Math.abs(speedY) < 1e-6) {
    body.setAngularVelocity(Vector3.Zero());
    return;
  }

  const collider = rig.collider;
  let q = collider.rotationQuaternion;
  if (!q) {
    q = Quaternion.Identity();
    collider.rotationQuaternion = q.clone();
  }

  const yaw = q.toEulerAngles().y + Math.abs(speedY) * (dtMs * 0.001);
  const nextRot = Quaternion.FromEulerAngles(0, yaw, 0);
  collider.rotationQuaternion = collider.rotationQuaternion ?? nextRot.clone();
  collider.rotationQuaternion.copyFrom(nextRot);
  body.setAngularVelocity(Vector3.Zero());
  body.setTargetTransform(collider.getAbsolutePosition(), nextRot);
}

export function releaseJewelCube(rig: JewelCubePhysicsRig): void {
  rig.aggregate.body.setMotionType(PhysicsMotionType.DYNAMIC);
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

export function launchJewelCubeFall(rig: JewelCubePhysicsRig, spinSign: 1 | -1): void {
  const body = rig.aggregate.body;
  body.setMotionType(PhysicsMotionType.DYNAMIC);
  body.setAngularVelocity(new Vector3(0, spinSign * 3.1, 0));
  body.setLinearVelocity(new Vector3(spinSign * 0.12, -0.08, 0.06));
}
