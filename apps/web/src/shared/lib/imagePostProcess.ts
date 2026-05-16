import type { PostProcessingSettings } from "../types";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function buildCssFilter(settings: PostProcessingSettings): string {
  const brightness = 1 + settings.brightness / 100;
  const contrast = 1 + settings.contrast / 100;
  const saturate = 1 + settings.saturation / 100;
  const sepia = clamp(settings.warmth, 0, 100) / 200;
  const hueRotate = clamp(settings.warmth, -100, 0) * -0.35;

  return [
    `brightness(${brightness.toFixed(3)})`,
    `contrast(${contrast.toFixed(3)})`,
    `saturate(${saturate.toFixed(3)})`,
    sepia > 0 ? `sepia(${sepia.toFixed(3)})` : null,
    hueRotate !== 0 ? `hue-rotate(${hueRotate.toFixed(2)}deg)` : null,
  ]
    .filter(Boolean)
    .join(" ");
}

export async function applyImagePostProcessing(
  sourceUrl: string,
  settings: PostProcessingSettings
): Promise<string> {
  const image = await loadImage(sourceUrl);
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas context is unavailable.");
  }

  context.filter = buildCssFilter(settings);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  context.filter = "none";

  if (settings.shadowLift !== 0) {
    context.globalCompositeOperation = "screen";
    context.fillStyle = `rgba(255, 255, 255, ${clamp(settings.shadowLift, 0, 100) / 400})`;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.globalCompositeOperation = "source-over";
  }

  if (settings.vignette > 0) {
    const gradient = context.createRadialGradient(
      canvas.width / 2,
      canvas.height / 2,
      canvas.width * 0.25,
      canvas.width / 2,
      canvas.height / 2,
      canvas.width * 0.72
    );
    gradient.addColorStop(0, "rgba(0,0,0,0)");
    gradient.addColorStop(1, `rgba(0,0,0,${clamp(settings.vignette, 0, 100) / 100})`);
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);
  }

  if (settings.sharpness > 0) {
    const sharpCanvas = document.createElement("canvas");
    sharpCanvas.width = canvas.width;
    sharpCanvas.height = canvas.height;
    const sharpContext = sharpCanvas.getContext("2d");
    if (sharpContext) {
      sharpContext.drawImage(canvas, 0, 0);
      context.globalAlpha = clamp(settings.sharpness, 0, 100) / 100;
      context.drawImage(sharpCanvas, -1, 0);
      context.drawImage(sharpCanvas, 1, 0);
      context.drawImage(sharpCanvas, 0, -1);
      context.drawImage(sharpCanvas, 0, 1);
      context.globalAlpha = 1;
    }
  }

  return canvas.toDataURL("image/png");
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to load image for post-processing."));
    image.src = url;
  });
}
