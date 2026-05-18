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
      mid.x -= 0.42;
      break;
    case "pitch_drop":
      mid.x += 0.38;
      break;
    case "roll_tilt":
      mid.z += 0.28 * (from.y < to.y ? 1 : -1);
      break;
    case "corner_swing":
      mid.x -= 0.22;
      mid.y += 0.18 * Math.sign(to.y - from.y || 1);
      mid.z += 0.14;
      break;
    case "yaw_arc":
    default:
      mid.y += 0.12 * Math.sign(to.y - from.y || 1);
      break;
  }
  return mid;
}

/** Two-segment slerp via a styled midpoint — richer than pure left-right yaw. */
export function slerpCubeTransition(
  from: THREE.Euler,
  to: THREE.Euler,
  alpha: number,
  step: number
): THREE.Euler {
  const style = STYLES[step % STYLES.length] ?? "yaw_arc";
  const clamped = Math.min(1, Math.max(0, alpha));
  const via = accentWaypoint(from, to, style);
  if (clamped <= 0.5) {
    return slerpEuler(from, via, clamped * 2);
  }
  return slerpEuler(via, to, (clamped - 0.5) * 2);
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
