/** Shared easing — leaf module (no fan motion imports). */

export function fanSpeedMul(speedMul: number): number {
  return Math.max(0.35, Math.min(2.5, speedMul));
}

/** C¹ smoothstep on [edge0, edge1]. */
export function fanSmootherstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / Math.max(edge1 - edge0, 1e-6)));
  return t * t * (3 - 2 * t);
}

/** C¹ smoothstep on [0, 1]. */
export function fanSmootherstep01(x: number): number {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
}
