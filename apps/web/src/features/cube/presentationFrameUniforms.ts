import type { CubeFramePresetId } from "@mbox/shared";
import { framePresetIndex } from "./cubeFramePresets";

export function createFramePresetUniform(framePresetId: CubeFramePresetId): {
  uFramePreset: { value: number };
} {
  return { uFramePreset: { value: framePresetIndex(framePresetId) } };
}

export function setFramePresetUniform(
  uniforms: { uFramePreset: { value: number } },
  framePresetId: CubeFramePresetId
): void {
  uniforms.uFramePreset.value = framePresetIndex(framePresetId);
}
