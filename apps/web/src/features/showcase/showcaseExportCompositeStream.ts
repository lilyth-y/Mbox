/** Composite DOM backdrop + WebGL canvas for MP4 export (captureStream is canvas-only). */

import {
  drawCanvasImageSourceCover,
  readCanvasImageSourceSize,
} from "./babylon/showcaseBackdropCover";

export type PaintShowcaseExportCompositeOptions = {
  sceneCanvas: HTMLCanvasElement;
  backdrop: HTMLVideoElement | HTMLImageElement | null;
  backdropOpacity: number;
  fallbackColor: string;
  size: number;
};

/** Single export frame — shared by composite stream + WYSIWYG fingerprint. */
export function paintShowcaseExportCompositeFrame(
  ctx: CanvasRenderingContext2D,
  options: PaintShowcaseExportCompositeOptions
): void {
  const { sceneCanvas, backdrop, backdropOpacity, fallbackColor, size } = options;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;

  ctx.fillStyle = fallbackColor;
  ctx.fillRect(0, 0, size, size);

  if (backdrop) {
    const { width: bw, height: bh } = readCanvasImageSourceSize(backdrop);
    if (bw > 0 && bh > 0) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, backdropOpacity));
      drawCanvasImageSourceCover(ctx, backdrop, size, size);
      ctx.restore();
    }
  }

  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  ctx.drawImage(sceneCanvas, 0, 0, size, size);
}

export type ShowcaseExportCompositeStreamOptions = {
  sceneCanvas: HTMLCanvasElement;
  backdrop: HTMLVideoElement | HTMLImageElement | null;
  backdropOpacity: number;
  fallbackColor: string;
  size: number;
  fps: number;
  /** Manual captureStream(0) — one encoder frame per paint (smooth when GPU < realtime). */
  manualCapture?: boolean;
  /** Use setInterval cadence instead of rAF-only pacing during export. */
  fixedCadence?: boolean;
  /** E2E/cloud: paint composite at fps while wall-clock animation runs (no paced render loop). */
  wallClockCapture?: boolean;
  /** Called after each Babylon render — paint composite here. Returns unsubscribe. */
  onAfterRender: (paint: () => void) => () => void;
};

export type ShowcaseExportCompositeStream = {
  stream: MediaStream;
  getPaintCount: () => number;
  beginRecording: () => void;
  waitForRecordedFrames: (frameCount: number, timeoutMs?: number) => Promise<void>;
  dispose: () => void;
  waitForPaintCount: (count: number, timeoutMs?: number) => Promise<void>;
};

export function createShowcaseExportCompositeStream(
  options: ShowcaseExportCompositeStreamOptions
): ShowcaseExportCompositeStream {
  const {
    sceneCanvas,
    backdrop,
    backdropOpacity,
    fallbackColor,
    size,
    fps,
    manualCapture = false,
    fixedCadence = false,
    wallClockCapture = false,
    onAfterRender,
  } = options;

  const composite = document.createElement("canvas");
  composite.width = size;
  composite.height = size;
  const ctx = composite.getContext("2d", { alpha: false });
  if (!ctx) {
    throw new Error("[showcase] export composite 2d context unavailable");
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  let paintCount = 0;
  let recordPaintCount = 0;
  let recordingActive = false;
  const paintWaiters: Array<(count: number) => void> = [];
  const recordWaiters: Array<(count: number) => void> = [];

  const notifyPaintWaiters = () => {
    if (paintWaiters.length === 0) {
      return;
    }
    const waiters = paintWaiters.splice(0);
    for (const waiter of waiters) {
      waiter(paintCount);
    }
  };

  const notifyRecordWaiters = () => {
    if (recordWaiters.length === 0) {
      return;
    }
    const waiters = recordWaiters.splice(0);
    for (const waiter of waiters) {
      waiter(recordPaintCount);
    }
  };

  const mediaStream = composite.captureStream(manualCapture ? 0 : fps);
  const videoTrack = mediaStream.getVideoTracks()[0] as MediaStreamTrack & {
    requestFrame?: () => void;
  };
  const requestEncoderFrame = (): void => {
    videoTrack.requestFrame?.();
  };

  const paint = () => {
    paintShowcaseExportCompositeFrame(ctx, {
      sceneCanvas,
      backdrop,
      backdropOpacity,
      fallbackColor,
      size,
    });

    paintCount += 1;
    notifyPaintWaiters();
    if (recordingActive) {
      recordPaintCount += 1;
      notifyRecordWaiters();
    }
    if (manualCapture) {
      requestEncoderFrame();
    }
  };

  paint();

  const unsubscribeRender = onAfterRender(paint);

  let disposed = false;
  let rafId = 0;
  let intervalId = 0;
  let lastPaintMs = 0;
  const frameIntervalMs = 1000 / Math.max(1, fps);

  const rafLoop = (now: number) => {
    if (disposed) {
      return;
    }
    if (!fixedCadence && now - lastPaintMs >= frameIntervalMs * 0.85) {
      paint();
      lastPaintMs = now;
    }
    rafId = requestAnimationFrame(rafLoop);
  };
  rafId = requestAnimationFrame(rafLoop);

  // Export uses onAfterRender only — interval + videoFrame paint caused judder.
  if (wallClockCapture) {
    intervalId = window.setInterval(() => {
      if (!disposed) {
        paint();
      }
    }, frameIntervalMs);
  } else if (!fixedCadence) {
    intervalId = window.setInterval(() => {
      if (!disposed) {
        paint();
      }
    }, frameIntervalMs);
  }

  let videoFrameHandle = 0;
  let videoFrameActive = false;
  if (
    !fixedCadence &&
    backdrop instanceof HTMLVideoElement &&
    typeof backdrop.requestVideoFrameCallback === "function"
  ) {
    videoFrameActive = true;
    const onVideoFrame = () => {
      if (!videoFrameActive) {
        return;
      }
      paint();
      videoFrameHandle = backdrop.requestVideoFrameCallback(onVideoFrame);
    };
    videoFrameHandle = backdrop.requestVideoFrameCallback(onVideoFrame);
  }

  const waitForPaintCount = (count: number, timeoutMs = 120_000): Promise<void> =>
    new Promise<void>((resolve, reject) => {
      if (paintCount >= count) {
        resolve();
        return;
      }

      const deadline = performance.now() + timeoutMs;
      const watchdog = window.setTimeout(() => {
        cleanup();
        reject(
          new Error(
            `[showcase] export timed out waiting for frames (${paintCount}/${count})`
          )
        );
      }, timeoutMs);

      const waiter = (current: number) => {
        if (current >= count) {
          cleanup();
          resolve();
          return;
        }
        if (performance.now() >= deadline) {
          cleanup();
          reject(
            new Error(
              `[showcase] export timed out waiting for frames (${current}/${count})`
            )
          );
          return;
        }
        paintWaiters.push(waiter);
      };

      const cleanup = () => {
        window.clearTimeout(watchdog);
        const index = paintWaiters.indexOf(waiter);
        if (index >= 0) {
          paintWaiters.splice(index, 1);
        }
      };

      paintWaiters.push(waiter);
    });

  const waitForRecordedFrames = (frameCount: number, timeoutMs = 120_000): Promise<void> =>
    new Promise<void>((resolve, reject) => {
      if (recordPaintCount >= frameCount) {
        resolve();
        return;
      }

      const deadline = performance.now() + timeoutMs;
      const watchdog = window.setTimeout(() => {
        cleanup();
        reject(
          new Error(
            `[showcase] export timed out waiting for frames (${recordPaintCount}/${frameCount})`
          )
        );
      }, timeoutMs);

      const waiter = (current: number) => {
        if (current >= frameCount) {
          cleanup();
          resolve();
          return;
        }
        if (performance.now() >= deadline) {
          cleanup();
          reject(
            new Error(
              `[showcase] export timed out waiting for frames (${current}/${frameCount})`
            )
          );
          return;
        }
        recordWaiters.push(waiter);
      };

      const cleanup = () => {
        window.clearTimeout(watchdog);
        const index = recordWaiters.indexOf(waiter);
        if (index >= 0) {
          recordWaiters.splice(index, 1);
        }
      };

      recordWaiters.push(waiter);
    });

  const beginRecording = (): void => {
    recordingActive = true;
    recordPaintCount = 0;
  };

  return {
    stream: mediaStream,
    getPaintCount: () => paintCount,
    beginRecording,
    waitForRecordedFrames,
    waitForPaintCount,
    dispose: () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      if (intervalId) {
        window.clearInterval(intervalId);
      }
      videoFrameActive = false;
      if (
        backdrop instanceof HTMLVideoElement &&
        videoFrameHandle &&
        typeof backdrop.cancelVideoFrameCallback === "function"
      ) {
        backdrop.cancelVideoFrameCallback(videoFrameHandle);
      }
      unsubscribeRender();
    },
  };
}
