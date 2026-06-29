import { resolveShowcaseGpuTier } from "../showcaseGpuProfile";
import { isLocalGpuSession, isLocalhostInteractivePreview } from "../../../shared/lib/gpuSession";

/** Frames to idle the GPU between heavy init steps (shader compile, mesh spawn). */
export function gpuSpreadFrameGap(): number {
  if (isLocalGpuSession()) {
    return 12;
  }
  if (isLocalhostInteractivePreview()) {
    return 12;
  }
  return resolveShowcaseGpuTier() === "simplified" ? 16 : 2;
}

/** Frame gap between holo photo texture uploads (smaller sets need less idle time). */
export function holoTextureSpreadGap(imageCount: number): number {
  if (isLocalGpuSession()) {
    return 8;
  }
  if (isLocalhostInteractivePreview()) {
    if (imageCount <= 3) {
      return 3;
    }
    if (imageCount <= 8) {
      return 5;
    }
    return 8;
  }
  return resolveShowcaseGpuTier() === "simplified" ? 8 : 2;
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
