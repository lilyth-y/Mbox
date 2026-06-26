/** object-fit: cover UV transform for fullscreen backdrop textures. */
export type BackdropCoverTransform = {
  uScale: number;
  vScale: number;
  uOffset: number;
  vOffset: number;
};

export function computeBackdropCoverTransform(
  mediaAspect: number,
  viewAspect: number
): BackdropCoverTransform {
  const media = Math.max(mediaAspect, 0.01);
  const view = Math.max(viewAspect, 0.01);

  if (media > view) {
    const uScale = view / media;
    return { uScale, vScale: 1, uOffset: (1 - uScale) * 0.5, vOffset: 0 };
  }

  const vScale = media / view;
  return { uScale: 1, vScale, uOffset: 0, vOffset: (1 - vScale) * 0.5 };
}

/** object-fit: contain — show the entire media with letterboxing (no crop). */
export function computeBackdropContainTransform(
  mediaAspect: number,
  viewAspect: number
): BackdropCoverTransform {
  const media = Math.max(mediaAspect, 0.01);
  const view = Math.max(viewAspect, 0.01);

  if (media > view) {
    const vScale = view / media;
    return { uScale: 1, vScale, uOffset: 0, vOffset: (1 - vScale) * 0.5 };
  }

  const uScale = media / view;
  return { uScale, vScale: 1, uOffset: (1 - uScale) * 0.5, vOffset: 0 };
}

export function readCanvasImageSourceSize(source: CanvasImageSource): {
  width: number;
  height: number;
} {
  if (source instanceof HTMLVideoElement) {
    return {
      width: source.videoWidth,
      height: source.videoHeight,
    };
  }
  if (source instanceof HTMLImageElement) {
    return {
      width: source.naturalWidth,
      height: source.naturalHeight,
    };
  }
  if (source instanceof HTMLCanvasElement) {
    return { width: source.width, height: source.height };
  }
  if (typeof ImageBitmap !== "undefined" && source instanceof ImageBitmap) {
    return { width: source.width, height: source.height };
  }
  return { width: 0, height: 0 };
}

/** Canvas 2D equivalent of CSS object-fit: cover. */
export function drawCanvasImageSourceCover(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  destWidth: number,
  destHeight: number
): boolean {
  const { width: sw, height: sh } = readCanvasImageSourceSize(source);
  if (sw <= 0 || sh <= 0) {
    return false;
  }
  const scale = Math.max(destWidth / sw, destHeight / sh);
  const dw = sw * scale;
  const dh = sh * scale;
  const dx = (destWidth - dw) * 0.5;
  const dy = (destHeight - dh) * 0.5;
  ctx.drawImage(source, dx, dy, dw, dh);
  return true;
}
