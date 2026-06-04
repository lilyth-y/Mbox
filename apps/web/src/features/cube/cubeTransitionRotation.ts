import * as THREE from "three";
import { CORNER_REST_ROTATION, getFaceRotation, getPresentationFace, slerpEuler } from "./cubeSequence";

export type CubeTransitionStyle = "yaw_arc" | "pitch_lift" | "pitch_drop" | "roll_tilt" | "corner_swing";

const STYLES: CubeTransitionStyle[] = [
  "yaw_arc",
  "pitch_lift",
  "pitch_drop",
  "roll_tilt",
  "corner_swing",
  "yaw_arc",
];

function accentWaypoint(
  from: THREE.Euler,
  to: THREE.Euler,
  style: CubeTransitionStyle
): THREE.Euler {
  const mid = slerpEuler(from, to, 0.5);
  switch (style) {
    case "pitch_lift":
      mid.x -= 0.26;
      break;
    case "pitch_drop":
      mid.x += 0.24;
      break;
    case "roll_tilt":
      mid.z += 0.17 * (from.y < to.y ? 1 : -1);
      break;
    case "corner_swing":
      mid.x -= 0.14;
      mid.y += 0.11 * Math.sign(to.y - from.y || 1);
      mid.z += 0.09;
      break;
    case "yaw_arc":
    default:
      mid.y += 0.07 * Math.sign(to.y - from.y || 1);
      break;
  }
  return mid;
}

export type CubeRotationMode =
  | "auto"
  | "mixed"
  | "yaw_cw"
  | "yaw_ccw"
  | "pitch_up"
  | "pitch_down"
  | "roll"
  | "corner_swing";

export function resolveCubeTransitionStyle(
  step: number,
  mode: CubeRotationMode = "auto"
): { style: CubeTransitionStyle; reverseYaw: boolean } {
  switch (mode) {
    case "yaw_cw":
      return { style: "yaw_arc", reverseYaw: false };
    case "yaw_ccw":
      return { style: "yaw_arc", reverseYaw: true };
    case "pitch_up":
      return { style: "pitch_lift", reverseYaw: false };
    case "pitch_down":
      return { style: "pitch_drop", reverseYaw: false };
    case "roll":
      return { style: "roll_tilt", reverseYaw: false };
    case "corner_swing":
      return { style: "corner_swing", reverseYaw: false };
    case "mixed":
    case "auto":
    default:
      return {
        style: STYLES[step % STYLES.length] ?? "yaw_arc",
        reverseYaw: false,
      };
  }
}

/** Two-segment slerp via a styled midpoint — richer than pure left-right yaw. */
export function slerpCubeTransition(
  from: THREE.Euler,
  to: THREE.Euler,
  alpha: number,
  step: number,
  mode: CubeRotationMode = "auto"
): THREE.Euler {
  const { style, reverseYaw } = resolveCubeTransitionStyle(step, mode);
  const clamped = Math.min(1, Math.max(0, alpha));
  const fromEuler = reverseYaw ? to : from;
  const toEuler = reverseYaw ? from : to;
  const via = accentWaypoint(fromEuler, toEuler, style);
  if (clamped <= 0.5) {
    return slerpEuler(fromEuler, via, clamped * 2);
  }
  return slerpEuler(via, toEuler, (clamped - 0.5) * 2);
}

export function getCubeEntryRotation(step: number): THREE.Euler {
  if (step === 0) {
    return CORNER_REST_ROTATION.clone();
  }
  return getFaceRotation(getPresentationFace(step));
}

export function getCubeExitRotation(step: number, presentationCount: number): THREE.Euler {
  if (step + 1 >= presentationCount) {
    return CORNER_REST_ROTATION.clone();
  }
  return getFaceRotation(getPresentationFace(step + 1));
}
