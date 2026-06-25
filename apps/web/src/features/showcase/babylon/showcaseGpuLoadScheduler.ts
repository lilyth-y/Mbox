import { resolveShowcaseGpuTier } from "../showcaseGpuProfile";
import { isLocalGpuExportSession } from "../../../shared/lib/renderExportProfile";

/** Frames to idle the GPU between heavy init steps (shader compile, mesh spawn). */
export function gpuSpreadFrameGap(): number {
  if (isLocalGpuExportSession()) {
    return 12;
  }
  return resolveShowcaseGpuTier() === "simplified" ? 16 : 2;
}

export function waitGpuFrames(frameCount: number): Promise<void> {
  if (frameCount <= 0) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    let left = frameCount;
    const step = () => {
      left -= 1;
      if (left <= 0) {
        resolve();
        return;
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

/** Run GPU-heavy steps one per burst, with frame gaps in between. */
export async function spreadGpuWork(
  steps: Array<() => void | Promise<void>>,
  framesBetween = gpuSpreadFrameGap()
): Promise<void> {
  for (let i = 0; i < steps.length; i += 1) {
    await steps[i]!();
    if (i < steps.length - 1) {
      await waitGpuFrames(framesBetween);
    }
  }
}
