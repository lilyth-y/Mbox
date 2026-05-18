/**
 * Motion tuned for comfortable human tracking (not rushed, not sluggish).
 * Targets: ~1.3s re-orient, ~0.85s dolly, ~2.7s depth hold, gentle accents.
 */

/** Inbound travel: diverse rotation onto the showcase face. */
export const PERCEPTUAL_TRAVEL_IN_MS = 1_500;

/** Outbound travel: keep spinning toward the next face (no idle freeze). */
export const PERCEPTUAL_TRAVEL_OUT_MS = 1_200;

/** @deprecated Use PERCEPTUAL_TRAVEL_IN_MS — kept for imports. */
export const PERCEPTUAL_ROTATE_MS = PERCEPTUAL_TRAVEL_IN_MS;

/** One continuous focus beat: dolly in → parallax hold → dolly out (not separate hard phases). */
export const PERCEPTUAL_ZOOM_MS = 1_050;
export const PERCEPTUAL_PARALLAX_MS = 2_650;
export const PERCEPTUAL_FOCUS_MS = PERCEPTUAL_ZOOM_MS + PERCEPTUAL_PARALLAX_MS;

/** Fraction of focus window for ease-in / hold / ease-out (sums to 1). */
export const PERCEPTUAL_FOCUS_IN_RATIO = 0.34;
export const PERCEPTUAL_FOCUS_HOLD_RATIO = 0.32;
export const PERCEPTUAL_FOCUS_OUT_RATIO = 0.34;

/** Between-scene pull-back (non-cube templates). Cube uses 0 for continuous flow. */
export const PERCEPTUAL_RESET_MS = 680;

/** Cube: no reset — next scene continues from near camera + previous face. */
export const PERCEPTUAL_CUBE_RESET_MS = 0;

/** Loop seam: last face → intro pose (matches step 0 at t=0). */
export const PERCEPTUAL_LOOP_BRIDGE_MS = 900;

/** Peak shader parallax over the hold window (ramped via smoothstep). */
export const PERCEPTUAL_PARALLAX_RATE_PER_SEC = 0.048;

/** Shader depth multiplier — visible separation without swim. */
export const PERCEPTUAL_DEPTH_EMPHASIS = 1.72;

/** Camera dolly ratio at peak focus (stronger pull-in). */
export const PERCEPTUAL_ZOOM_SCALE = 1.4;

/** Mesh scale gain at peak focus (tracks dolly envelope). */
export const PERCEPTUAL_FOCUS_SCALE_GAIN = 0.062;

/** Opening cube pose — slight yaw only; first turn stays axis-centered. */
export const PERCEPTUAL_CORNER_REST = { x: 0, y: 0.38, z: 0 } as const;

export function smoothstep01(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

/** Ease-in-out sine — softer than smoothstep for long holds. */
export function easeInOutSine01(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return -(Math.cos(Math.PI * x) - 1) / 2;
}

export function rampParallaxAmount(elapsedMs: number, holdMs: number, peak: number): number {
  if (holdMs <= 0) {
    return 0;
  }
  const t = Math.min(1, Math.max(0, elapsedMs / holdMs));
  return easeInOutSine01(t) * peak;
}

/** 0 → peak → 0 over the hold window — soft handoff into the next rotation. */
export function bellParallaxAmount(elapsedMs: number, holdMs: number, peak: number): number {
  if (holdMs <= 0) {
    return 0;
  }
  const t = Math.min(1, Math.max(0, elapsedMs / holdMs));
  return peak * Math.sin(Math.PI * t);
}

/**
 * Smooth dolly-in → hold → dolly-out over u∈[0,1] (entire focus window).
 * Edges at 0 = far camera; middle = close — no step change between zoom/parallax phases.
 */
export function focusDollyEnvelope(u: number): number {
  const x = Math.min(1, Math.max(0, u));
  const inEnd = PERCEPTUAL_FOCUS_IN_RATIO;
  const outStart = 1 - PERCEPTUAL_FOCUS_OUT_RATIO;

  if (x < inEnd) {
    return smoothstep01(x / inEnd);
  }
  if (x < outStart) {
    return 1;
  }
  const outT = (x - outStart) / Math.max(PERCEPTUAL_FOCUS_OUT_RATIO, 0.001);
  return 1 - smoothstep01(outT);
}

/** Parallax only while near full focus (plateau), fades before dolly-out completes. */
export function focusParallaxEnvelope(u: number): number {
  const x = Math.min(1, Math.max(0, u));
  const holdStart = PERCEPTUAL_FOCUS_IN_RATIO * 0.85;
  const holdEnd = 1 - PERCEPTUAL_FOCUS_OUT_RATIO * 0.85;
  if (x < holdStart || x > holdEnd) {
    return 0;
  }
  const t = (x - holdStart) / Math.max(holdEnd - holdStart, 0.001);
  return Math.sin(Math.PI * t);
}
