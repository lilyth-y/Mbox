/** Smooth hue cycle for frame / ambient gradient (seconds). */
export function getGradientShift(elapsedMs: number, speed = 1): number {
  return elapsedMs * 0.0012 * speed;
}

export function gradientAccentRgb(shift: number): [number, number, number] {
  const t = shift % (Math.PI * 2);
  const r = 0.78 + 0.14 * Math.sin(t);
  const g = 0.58 + 0.18 * Math.sin(t + 2.1);
  const b = 0.62 + 0.16 * Math.sin(t + 4.2);
  return [r, g, b];
}
