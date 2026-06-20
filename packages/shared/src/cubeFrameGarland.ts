import type { CubeFramePresetId } from "./cube-export.js";
import type { FanBladeFrameId } from "./fanBladeFrame.js";

/** Cube face frame preset → fan-blade ornament ring style (shared wedding vocabulary). */
export const CUBE_FRAME_TO_FAN_BLADE_FRAME: Record<CubeFramePresetId, FanBladeFrameId> = {
  rose_gold: "rose_gold_ring",
  pearl_white: "pearl_ring",
  classic_black: "classic_black_ring",
  sage_garden: "sage_garden_ring",
  royal_navy: "royal_navy_ring",
};

export function cubeFramePresetToFanBladeFrameId(
  preset: CubeFramePresetId
): FanBladeFrameId {
  return CUBE_FRAME_TO_FAN_BLADE_FRAME[preset] ?? "rose_gold_ring";
}

/** Square face border walk: t∈[0,1) clockwise from top-left. */
export function sampleCubeFaceBorderPoint(
  t: number,
  halfSize: number,
  inset: number
): { x: number; y: number } {
  const s = Math.max(halfSize - inset, halfSize * 0.5);
  const sideLen = 2 * s;
  const total = 4 * sideLen;
  let d = ((t % 1) + 1) % 1 * total;

  if (d < sideLen) {
    return { x: -s + d, y: s };
  }
  d -= sideLen;
  if (d < sideLen) {
    return { x: s, y: s - d };
  }
  d -= sideLen;
  if (d < sideLen) {
    return { x: s - d, y: -s };
  }
  d -= sideLen;
  return { x: -s, y: -s + d };
}

/** Tangent-aligned rotation (radians) for ornament planes on the border path. */
export function sampleCubeFaceBorderRotation(t: number): number {
  const seg = Math.floor(((t % 1) + 1) % 1 * 4) % 4;
  if (seg === 0) return 0;
  if (seg === 1) return -Math.PI / 2;
  if (seg === 2) return Math.PI;
  return Math.PI / 2;
}
