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
 * Ease-in, cruise, optional ease-out — smooth rotate+morph segment spin.
 * `easeInPortion` / `easeOutPortion` = fraction of duration ramping speed.
 */
export function computeIntegralEaseInCruiseSpinSpeedY(
  phaseElapsedMs: number,
  dtMs: number,
  durationMs: number,
  peakSpeedY: number,
  easeInPortion = 0.25,
  easeOutPortion = 0
): number {
  if (durationMs <= 0 || dtMs <= 0) {
    return 0;
  }
  const easeInMs = Math.max(1, durationMs * Math.max(0.05, Math.min(0.5, easeInPortion)));
  const easeOutMs =
    easeOutPortion > 0
      ? Math.max(1, durationMs * Math.max(0.05, Math.min(0.4, easeOutPortion)))
      : 0;
  const cruiseEnd = Math.max(easeInMs, durationMs - easeOutMs);

  if (easeOutMs > 0 && phaseElapsedMs >= cruiseEnd) {
    return computeSpinDecayTargetSpeedY(
      Math.max(0, phaseElapsedMs - cruiseEnd),
      easeOutMs,
      peakSpeedY
    );
  }

  if (phaseElapsedMs >= easeInMs) {
    return peakSpeedY;
  }

  const totalYaw = Math.abs(peakSpeedY) * (easeInMs * 0.001);
  const t0 = phaseElapsedMs / easeInMs;
  const t1 = Math.min(1, (phaseElapsedMs + dtMs) / easeInMs);
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
