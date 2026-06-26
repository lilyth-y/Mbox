/** Per-image spin direction — legacy; showcase uses 4-way loop instead. */
export function resolveShowcaseSpinSign(imageIndex: number): 1 | -1 {
  const pattern: readonly (1 | -1)[] = [1, -1, 1, -1, -1, 1];
  return pattern[((imageIndex % pattern.length) + pattern.length) % pattern.length] ?? 1;
}

/** Symmetric ease-in-out quadratic — constant angular acceleration / deceleration. */
export function easeInOutUniformAccel(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2;
}

/** Ease-out quadratic — decelerate to rest (constant negative angular acceleration). */
export function easeOutUniformDecel(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return 1 - (1 - x) ** 2;
}

/** Ease-in quadratic — ramp from rest (constant positive angular acceleration). */
export function easeInUniformAccel(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x * x;
}

/**
 * Ease-in then hold peak — no end deceleration (stage handoff friendly).
 * `easeInPortion` = fraction of duration spent ramping to peakSpeedY.
 */
export function computeIntegralEaseInCruiseSpinSpeedY(
  phaseElapsedMs: number,
  dtMs: number,
  durationMs: number,
  peakSpeedY: number,
  easeInPortion = 0.25
): number {
  if (durationMs <= 0 || dtMs <= 0) {
    return 0;
  }
  const easeMs = Math.max(1, durationMs * Math.max(0.05, Math.min(0.5, easeInPortion)));
  if (phaseElapsedMs >= easeMs) {
    return peakSpeedY;
  }
  const totalYaw = Math.abs(peakSpeedY) * (easeMs * 0.001);
  const t0 = phaseElapsedMs / easeMs;
  const t1 = Math.min(1, (phaseElapsedMs + dtMs) / easeMs);
  const deltaYaw = totalYaw * (easeInUniformAccel(t1) - easeInUniformAccel(t0));
  return deltaYaw / (dtMs * 0.001);
}

/** Target spin magnitude decaying from entrySpeedY to 0 (pull lead). */
export function computeSpinDecayTargetSpeedY(
  phaseElapsedMs: number,
  durationMs: number,
  entrySpeedY: number
): number {
  if (durationMs <= 0) {
    return 0;
  }
  const t = Math.max(0, Math.min(1, phaseElapsedMs / durationMs));
  return Math.abs(entrySpeedY) * (1 - easeOutUniformDecel(t));
}
