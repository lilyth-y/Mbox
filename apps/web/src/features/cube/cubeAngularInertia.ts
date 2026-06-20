import * as THREE from "three";
import {
  CUBE_ANGULAR_SPEED_MAX_RAD,
  CUBE_INERTIA_HOLD_DAMPING,
  CUBE_INERTIA_HOLD_STIFFNESS,
  CUBE_INERTIA_ROTATION_DAMPING,
  CUBE_INERTIA_ROTATION_STIFFNESS,
  CUBE_INERTIA_SCALE_DAMPING,
  CUBE_INERTIA_SCALE_STIFFNESS,
} from "@mbox/shared";
import type { FanPhase } from "./fanTiming";
import type { PresentationFrame } from "./presentationFrame";

export type CubeInertiaPhase = FanPhase | "loop_bridge";

export interface FanRootMotionTarget {
  rotation: THREE.Euler;
  presentationScale: number;
}

export interface CubeAngularInertiaState {
  orientation: THREE.Quaternion;
  angularVelocity: THREE.Vector3;
  scale: number;
  scaleVelocity: number;
  initialized: boolean;
}

export interface CubeAngularInertiaOptions {
  enabled: boolean;
  phase?: CubeInertiaPhase;
}

export function createCubeAngularInertiaState(): CubeAngularInertiaState {
  return {
    orientation: new THREE.Quaternion(),
    angularVelocity: new THREE.Vector3(),
    scale: 1,
    scaleVelocity: 0,
    initialized: false,
  };
}

function rotationStiffnessDamping(phase: CubeInertiaPhase | undefined): {
  stiffness: number;
  damping: number;
} {
  if (phase === "showcase_hold") {
    return {
      stiffness: CUBE_INERTIA_HOLD_STIFFNESS,
      damping: CUBE_INERTIA_HOLD_DAMPING,
    };
  }
  if (phase === "loop_bridge") {
    return { stiffness: 20, damping: 9 };
  }
  return {
    stiffness: CUBE_INERTIA_ROTATION_STIFFNESS,
    damping: CUBE_INERTIA_ROTATION_DAMPING,
  };
}

function clampAngularSpeed(omega: THREE.Vector3): void {
  const speed = omega.length();
  if (speed > CUBE_ANGULAR_SPEED_MAX_RAD) {
    omega.multiplyScalar(CUBE_ANGULAR_SPEED_MAX_RAD / speed);
  }
}

function rotationErrorVector(
  targetQ: THREE.Quaternion,
  currentQ: THREE.Quaternion,
  out: THREE.Vector3
): THREE.Vector3 {
  const qErr = new THREE.Quaternion().copy(targetQ).multiply(currentQ.clone().invert()).normalize();
  const angle = 2 * Math.acos(THREE.MathUtils.clamp(qErr.w, -1, 1));
  if (angle < 1e-6) {
    return out.set(0, 0, 0);
  }
  const sinHalf = Math.sqrt(Math.max(1e-8, 1 - qErr.w * qErr.w));
  const axisScale = angle / sinHalf;
  return out.set(qErr.x * axisScale, qErr.y * axisScale, qErr.z * axisScale);
}

export function syncCubeAngularInertiaState(
  state: CubeAngularInertiaState,
  target: FanRootMotionTarget
): void {
  state.orientation.setFromEuler(target.rotation);
  state.angularVelocity.set(0, 0, 0);
  state.scale = target.presentationScale;
  state.scaleVelocity = 0;
  state.initialized = true;
}

export function stepCubeAngularInertia(
  state: CubeAngularInertiaState,
  target: FanRootMotionTarget,
  deltaMs: number,
  options: CubeAngularInertiaOptions
): FanRootMotionTarget {
  if (!options.enabled) {
    syncCubeAngularInertiaState(state, target);
    return target;
  }

  const dt = THREE.MathUtils.clamp(deltaMs / 1000, 0.001, 0.05);
  if (!state.initialized) {
    syncCubeAngularInertiaState(state, target);
    return {
      rotation: new THREE.Euler().setFromQuaternion(state.orientation, "XYZ"),
      presentationScale: state.scale,
    };
  }

  const targetQ = new THREE.Quaternion().setFromEuler(target.rotation);
  const { stiffness, damping } = rotationStiffnessDamping(options.phase);
  const error = rotationErrorVector(targetQ, state.orientation, new THREE.Vector3());

  state.angularVelocity.x += (stiffness * error.x - damping * state.angularVelocity.x) * dt;
  state.angularVelocity.y += (stiffness * error.y - damping * state.angularVelocity.y) * dt;
  state.angularVelocity.z += (stiffness * error.z - damping * state.angularVelocity.z) * dt;
  clampAngularSpeed(state.angularVelocity);

  const w = state.angularVelocity;
  const wLen = w.length();
  if (wLen > 1e-7) {
    const deltaQ = new THREE.Quaternion().setFromAxisAngle(
      w.clone().normalize(),
      wLen * dt
    );
    state.orientation.premultiply(deltaQ).normalize();
  }

  const scaleAccel =
    CUBE_INERTIA_SCALE_STIFFNESS * (target.presentationScale - state.scale) -
    CUBE_INERTIA_SCALE_DAMPING * state.scaleVelocity;
  state.scaleVelocity += scaleAccel * dt;
  state.scale += state.scaleVelocity * dt;

  return {
    rotation: new THREE.Euler().setFromQuaternion(state.orientation, "XYZ"),
    presentationScale: state.scale,
  };
}

export function applyFanRootMotionToObject(
  root: THREE.Object3D,
  motion: FanRootMotionTarget
): void {
  root.rotation.set(motion.rotation.x, motion.rotation.y, motion.rotation.z);
  root.position.set(0, 0, 0);
  root.scale.set(motion.presentationScale, motion.presentationScale, motion.presentationScale);
}

export function applyPresentationRootTransform(
  frame: PresentationFrame,
  root: THREE.Object3D,
  step: number,
  presentationCount: number,
  deltaMs: number,
  inertiaState: CubeAngularInertiaState | null,
  inertiaOptions: CubeAngularInertiaOptions
): void {
  if (inertiaOptions.enabled && frame.fanRootMotion && inertiaState) {
    // Showcase: exact face-forward lock (legacy wedding-simple; no spring overshoot).
    if (inertiaOptions.phase === "showcase_hold") {
      syncCubeAngularInertiaState(inertiaState, frame.fanRootMotion);
      applyFanRootMotionToObject(root, frame.fanRootMotion);
      return;
    }
    const integrated = stepCubeAngularInertia(
      inertiaState,
      frame.fanRootMotion,
      deltaMs,
      inertiaOptions
    );
    applyFanRootMotionToObject(root, integrated);
    return;
  }

  frame.applyRootTransform(root, step, presentationCount);
  if (inertiaState && frame.fanRootMotion) {
    syncCubeAngularInertiaState(inertiaState, frame.fanRootMotion);
  }
}
