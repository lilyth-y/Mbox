import type { CubeFocusSettings } from "./CubeFocusPanel";

/** Toggle VoluMax depth split — disables subject pull when turning off. */
export function patchVoluMaxDepthEnabled(
  enabled: boolean
): Partial<Pick<CubeFocusSettings, "voluMaxDepthEnabled" | "cubeSubjectPullEnabled">> {
  if (enabled) {
    return { voluMaxDepthEnabled: true };
  }
  return { voluMaxDepthEnabled: false, cubeSubjectPullEnabled: false };
}
