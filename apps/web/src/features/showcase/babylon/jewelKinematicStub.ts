import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { PhysicsMotionType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";
import type { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate";

const ZERO = Vector3.Zero();

/** Preview-only stub when Havok is skipped — collider transforms only. */
export function createKinematicPhysicsAggregateStub(): PhysicsAggregate {
  const body = {
    setMotionType(_type: PhysicsMotionType) {},
    setTargetTransform(_position: Vector3, _rotation: Quaternion) {},
    setLinearVelocity(_velocity: Vector3) {},
    setAngularVelocity(_velocity: Vector3) {},
    getLinearVelocity() {
      return ZERO;
    },
    getAngularVelocity() {
      return ZERO;
    },
  };

  return {
    body,
    dispose() {},
  } as unknown as PhysicsAggregate;
}
