/** Composite DOM backdrop + WebGL canvas for MP4 export (captureStream is canvas-only). */

function readSourceSize(source: CanvasImageSource): { width: number; height: number } {
  if (source instanceof HTMLVideoElement) {
    return { width: source.videoWidth, height: source.videoHeight };
  }
  if (source instanceof HTMLImageElement) {
    return { width: source.naturalWidth, height: source.naturalHeight };
  }
  if (source instanceof HTMLCanvasElement) {
    return { width: source.width, height: source.height };
  }
  if (typeof ImageBitmap !== "undefined" && source instanceof ImageBitmap) {
    return { width: source.width, height: source.height };
  }
  return { width: 0, height: 0 };
}

function drawBackdropCover(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  width: number,
  height: number
): void {
  const { width: sw, height: sh } = readSourceSize(source);
  if (sw <= 0 || sh <= 0) {
    return;
  }
  const scale = Math.max(width / sw, height / sh);
  const dw = sw * scale;
  const dh = sh * scale;
  const dx = (width - dw) * 0.5;
  const dy = (height - dh) * 0.5;
  ctx.drawImage(source, dx, dy, dw, dh);
}

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
    const { width: bw, height: bh } = readSourceSize(backdrop);
    if (bw > 0 && bh > 0) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, backdropOpacity));
      drawBackdropCover(ctx, backdrop, size, size);
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
  /** Use setInterval cadence instead of rAF-only pacing during export. */
  fixedCadence?: boolean;
  /** Called after each Babylon render — paint composite here. Returns unsubscribe. */
  onAfterRender: (paint: () => void) => () => void;
};

export type ShowcaseExportCompositeStream = {
  stream: MediaStream;
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
    fixedCadence = false,
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
  const paintWaiters: Array<(count: number) => void> = [];

  const notifyPaintWaiters = () => {
    if (paintWaiters.length === 0) {
      return;
    }
    const waiters = paintWaiters.splice(0);
    for (const waiter of waiters) {
      waiter(paintCount);
    }
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
  };

  paint();

  const unsubscribeRender = onAfterRender(paint);
  const stream = composite.captureStream(fps);

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

  if (fixedCadence) {
    intervalId = window.setInterval(() => {
      if (!disposed) {
        paint();
      }
    }, frameIntervalMs);
  }

  let videoFrameHandle = 0;
  let videoFrameActive = false;
  if (
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
        }
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

  return {
    stream,
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
