import * as THREE from "three";
import { CORNER_REST_ROTATION, getCubeShowcaseRootRotation, getPresentationFace, slerpEuler } from "./cubeSequence";
import { fanSmootherstep01 } from "./fanEase";

export type CubeTransitionStyle = "yaw_arc" | "pitch_lift" | "pitch_drop" | "roll_tilt" | "corner_swing";

// Historical per-step style cycling (for "mixed"/"auto" variety).
// No longer used for auto/mixed in order to provide directional consistency
// (stable left-right / yaw-dominant flow across photos, as requested).
// Preserved here (as _STYLES) for documentation and potential future "occasional accent" logic.
// Variety is now provided via tumble (local axis wobbles with speed envelopes),
// whoosh/scale-coupled intensity, and explicit user-chosen fixed modes.
const _STYLES: CubeTransitionStyle[] = [
  "yaw_arc",
  "pitch_lift",
  "pitch_drop",
  "roll_tilt",
  "corner_swing",
  "yaw_arc",
];
void _STYLES; // referenced for docs only; prevents unused var error while keeping the definition visible.

function accentWaypoint(
  from: THREE.Euler,
  to: THREE.Euler,
  style: CubeTransitionStyle
): THREE.Euler {
  const mid = slerpEuler(from, to, 0.5);
  switch (style) {
    case "pitch_lift":
      mid.x -= 0.32;
      mid.z += 0.06 * Math.sign(to.z - from.z || 1);
      break;
    case "pitch_drop":
      mid.x += 0.3;
      mid.y += 0.05 * Math.sign(to.y - from.y || 1);
      break;
    case "roll_tilt":
      mid.z += 0.22 * (from.y < to.y ? 1 : -1);
      mid.x -= 0.08;
      break;
    case "corner_swing":
      mid.x -= 0.18;
      mid.y += 0.14 * Math.sign(to.y - from.y || 1);
      mid.z += 0.12;
      break;
    case "yaw_arc":
    default:
      mid.y += 0.1 * Math.sign(to.y - from.y || 1);
      mid.x -= 0.06;
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
  _step: number,
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
      // For consistency across photos (as requested: avoid per-step axis flips like left-then-right or up-then-down
      // that feel like yo-yo at transitions), lock the main path slerp style to yaw_arc for auto/mixed.
      // Variety comes from:
      // - tumble / complex rotation (local pitch/roll with modulated speed)
      // - whoosh / scale-coupled spin intensity (speed variation while small)
      // - spin sign / rev curves (acceleration profiles)
      // - explicit fixed modes (yaw_cw etc.) when user wants a specific axis.
      // This keeps "상하좌우" (primarily left-right yaw flow) consistent while speed/acceleration varies naturally.
      return {
        style: "yaw_arc",
        reverseYaw: false,
      };
  }
}

/**
 * C¹ spherical blend via styled waypoint (no kink at α=0.5).
 * q(t) = slerp(slerp(from,via,t), slerp(via,to,t), t) with smooth t.
 */
export function slerpCubeTransition(
  from: THREE.Euler,
  to: THREE.Euler,
  alpha: number,
  step: number,
  mode: CubeRotationMode = "auto"
): THREE.Euler {
  const { style, reverseYaw } = resolveCubeTransitionStyle(step, mode);
  const t = fanSmootherstep01(alpha);
  const fromEuler = reverseYaw ? to : from;
  const toEuler = reverseYaw ? from : to;
  if (t <= 0) {
    return fromEuler.clone();
  }
  if (t >= 1) {
    return toEuler.clone();
  }
  const via = accentWaypoint(fromEuler, toEuler, style);
  const ab = slerpEuler(fromEuler, via, t);
  const bc = slerpEuler(via, toEuler, t);
  return slerpEuler(ab, bc, t);
}

export function getCubeEntryRotation(step: number): THREE.Euler {
  if (step === 0) {
    return CORNER_REST_ROTATION.clone();
  }
  return getCubeShowcaseRootRotation(getPresentationFace(step));
}

export function getCubeExitRotation(step: number, presentationCount: number): THREE.Euler {
  if (step + 1 >= presentationCount) {
    return CORNER_REST_ROTATION.clone();
  }
  return getCubeShowcaseRootRotation(getPresentationFace(step + 1));
}
