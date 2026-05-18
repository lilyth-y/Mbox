import type { ResolutionEnhanceScale } from "@mbox/shared";

const DEFAULT_MAX_EDGE = 2048;

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("해상도 향상용 이미지를 불러오지 못했습니다."));
    image.src = url;
  });
}

function applyUnsharp(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  amount: number
): void {
  const sharpCanvas = document.createElement("canvas");
  sharpCanvas.width = canvas.width;
  sharpCanvas.height = canvas.height;
  const sharpContext = sharpCanvas.getContext("2d");
  if (!sharpContext) {
    return;
  }
  sharpContext.drawImage(canvas, 0, 0);
  const alpha = Math.min(1, Math.max(0, amount / 100));
  context.globalAlpha = alpha;
  context.drawImage(sharpCanvas, -1, 0);
  context.drawImage(sharpCanvas, 1, 0);
  context.drawImage(sharpCanvas, 0, -1);
  context.drawImage(sharpCanvas, 0, 1);
  context.globalAlpha = 1;
}

/**
 * Browser-side 2× upscale with high-quality resampling + light sharpen (product tier).
 */
export async function upscaleImageDataUrl(
  sourceUrl: string,
  scale: ResolutionEnhanceScale = 2,
  maxEdge = DEFAULT_MAX_EDGE
): Promise<string> {
  if (scale <= 1) {
    return sourceUrl;
  }

  const image = await loadImage(sourceUrl);
  const targetWidth = Math.min(Math.round(image.width * scale), maxEdge);
  const targetHeight = Math.min(Math.round(image.height * scale), maxEdge);

  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas context is unavailable.");
  }

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, targetWidth, targetHeight);
  applyUnsharp(context, canvas, 28);

  const hasAlpha = sourceUrl.startsWith("data:image/png");
  if (hasAlpha) {
    return canvas.toDataURL("image/png");
  }
  return canvas.toDataURL("image/jpeg", 0.92);
}
