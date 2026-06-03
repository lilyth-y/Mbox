import type { PresentationFrame } from "./presentationFrame";
import { DEFAULT_CAMERA_Z } from "./cubeSequence";

/** Wider FOV + no dolly zoom so exports keep the full framed photo. */
export const EXPORT_PRESENTATION_FOV = 88;
export const EXPORT_PRESENTATION_CAMERA_Z = DEFAULT_CAMERA_Z;

export const EXPORT_PARALLAX_MUL_DEFAULT = 0.22;
/** Hologram entrance MP4 — stronger parallax than flat export (Attempt 2). */
export const EXPORT_HOLOGRAM_PARALLAX_MUL = 0.5;

export const EXPORT_FOCUS_PULSE_MUL_DEFAULT = 0;
/** Hologram entrance MP4 — partial focus pulse (Attempt 3). */
export const EXPORT_HOLOGRAM_FOCUS_PULSE_MUL = 0.35;

export interface ExportPresentationOptions {
  hologramMode?: boolean;
}

export function applyExportPresentationOverrides(
  frame: PresentationFrame,
  options: ExportPresentationOptions = {}
): PresentationFrame {
  const parallaxMul = options.hologramMode
    ? EXPORT_HOLOGRAM_PARALLAX_MUL
    : EXPORT_PARALLAX_MUL_DEFAULT;
  const focusPulseMul = options.hologramMode
    ? EXPORT_HOLOGRAM_FOCUS_PULSE_MUL
    : EXPORT_FOCUS_PULSE_MUL_DEFAULT;
  const baseApply = frame.applyRootTransform;
  const baseFocusPulse = frame.focusPulse ?? 0;
  return {
    cameraZ: EXPORT_PRESENTATION_CAMERA_Z,
    fieldOfView: EXPORT_PRESENTATION_FOV,
    cameraOffsetX: 0,
    cameraOffsetY: 0,
    parallaxAmount: frame.parallaxAmount * parallaxMul,
    focusPulse: baseFocusPulse * focusPulseMul,
    applyRootTransform: (root, step, presentationCount) => {
      baseApply(root, step, presentationCount);
    },
  };
}
