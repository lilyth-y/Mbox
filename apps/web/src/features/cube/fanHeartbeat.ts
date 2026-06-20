/** One lub-dub cycle (~72 bpm). */
export const FAN_HEARTBEAT_MS = 840;

export interface HeartbeatSample {
  /** 0..1 lub-dub envelope */
  envelope: number;
  /** Scale / camera pull strength */
  scale: number;
  /** Shader focus pulse boost */
  pulse: number;
}

function gaussianBump(t: number, center: number, sigma: number, amp = 1): number {
  const x = (t - center) / Math.max(sigma, 1e-6);
  return amp * Math.exp(-0.5 * x * x);
}

/**
 * Asymmetric double-pulse (lub-dub) for organic “heartbeat” motion.
 * `phaseElapsedMs` — time within the current phase.
 */
export function sampleHeartbeat(phaseElapsedMs: number): HeartbeatSample {
  const t = (phaseElapsedMs % FAN_HEARTBEAT_MS) / FAN_HEARTBEAT_MS;
  const lub = gaussianBump(t, 0.14, 0.055);
  const dub = gaussianBump(t, 0.36, 0.062, 0.62);
  const envelope = Math.min(1, lub + dub);
  return {
    envelope,
    scale: envelope,
    pulse: envelope * (0.5 + 0.5 * lub),
  };
}

/** Blend heartbeat in/out at phase edges so pulses don’t pop on phase change. */
export function heartbeatPhaseBlend(phaseU: number, edgeFrac = 0.12): number {
  const u = Math.min(1, Math.max(0, phaseU));
  if (u < edgeFrac) {
    return u / edgeFrac;
  }
  if (u > 1 - edgeFrac) {
    return (1 - u) / edgeFrac;
  }
  return 1;
}
