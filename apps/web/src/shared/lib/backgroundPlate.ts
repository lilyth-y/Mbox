import type { ProcessedImage } from "../types";
import { estimateDataUrlBytes } from "./mediaLimits";

export type BackgroundPlateTheme =
  | "original"
  | "original_blurred"
  | "classic_hall"
  | "romantic_garden"
  | "starry_night";

export const WEDDING_BACKGROUND_THEMES: { id: BackgroundPlateTheme; label: string }[] = [
  { id: "original", label: "원본 배경" },
  { id: "original_blurred", label: "기본 블러 배경" },
  { id: "classic_hall", label: "클래식 웨딩홀" },
  { id: "romantic_garden", label: "로맨틱 가든" },
  { id: "starry_night", label: "은하수 밤하늘" },
];

export interface BackgroundPlateOptions {
  size?: number;
  blurPx?: number;
  theme?: BackgroundPlateTheme;
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to load image for background plate."));
    image.src = dataUrl;
  });
}

function createSeededRandom(seed: number): () => number {
  let state = seed % 2147483646;
  if (state <= 0) {
    state += 2147483645;
  }
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

function applyThemeOverlay(
  context: CanvasRenderingContext2D,
  theme: BackgroundPlateTheme,
  size: number,
  seed = 1
): void {
  const rand = createSeededRandom(seed);

  if (theme === "original_blurred") {
    context.fillStyle = "rgba(72, 38, 48, 0.18)";
    context.fillRect(0, 0, size, size);
    context.fillStyle = "rgba(255, 232, 220, 0.12)";
    context.fillRect(0, 0, size, size);
    return;
  }

  if (theme === "romantic_garden") {
    const grad = context.createLinearGradient(0, 0, size, size);
    grad.addColorStop(0, "rgba(253, 244, 245, 0.52)");
    grad.addColorStop(0.5, "rgba(251, 207, 232, 0.48)");
    grad.addColorStop(1, "rgba(209, 250, 229, 0.55)");
    context.fillStyle = grad;
    context.fillRect(0, 0, size, size);

    for (let i = 0; i < 20; i += 1) {
      const x = rand() * size;
      const y = rand() * size;
      const radius = 25 + rand() * 65;
      const bokehGrad = context.createRadialGradient(x, y, 0, x, y, radius);
      bokehGrad.addColorStop(0, "rgba(251, 113, 133, 0.35)");
      bokehGrad.addColorStop(0.5, "rgba(244, 114, 182, 0.12)");
      bokehGrad.addColorStop(1, "rgba(255, 255, 255, 0)");
      context.fillStyle = bokehGrad;
      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.fill();
    }
    return;
  }

  if (theme === "classic_hall") {
    const grad = context.createLinearGradient(0, 0, 0, size);
    grad.addColorStop(0, "rgba(42, 28, 18, 0.42)");
    grad.addColorStop(0.6, "rgba(223, 179, 134, 0.45)");
    grad.addColorStop(1, "rgba(255, 248, 235, 0.58)");
    context.fillStyle = grad;
    context.fillRect(0, 0, size, size);

    context.fillStyle = "rgba(255, 244, 214, 0.14)";
    for (let i = 0; i < 4; i += 1) {
      const topX = 150 + rand() * 700;
      context.beginPath();
      context.moveTo(topX - 35, 0);
      context.lineTo(topX + 35, 0);
      context.lineTo(topX + 180 + rand() * 120, size);
      context.lineTo(topX - 180 - rand() * 120, size);
      context.closePath();
      context.fill();
    }
    return;
  }

  if (theme === "starry_night") {
    const grad = context.createLinearGradient(0, 0, 0, size);
    grad.addColorStop(0, "rgba(20, 10, 36, 0.55)");
    grad.addColorStop(0.5, "rgba(10, 8, 28, 0.48)");
    grad.addColorStop(1, "rgba(3, 2, 8, 0.62)");
    context.fillStyle = grad;
    context.fillRect(0, 0, size, size);

    for (let i = 0; i < 35; i += 1) {
      const x = rand() * size;
      const y = rand() * size;
      const radius = 3 + rand() * 12;
      const starGrad = context.createRadialGradient(x, y, 0, x, y, radius);
      starGrad.addColorStop(0, "rgba(255, 255, 255, 0.95)");
      starGrad.addColorStop(0.2, "rgba(238, 242, 255, 0.8)");
      starGrad.addColorStop(0.6, "rgba(129, 140, 248, 0.25)");
      starGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
      context.fillStyle = starGrad;
      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.fill();
    }
  }
}

/** Blurred fill plate for dual-layer cube parallax (background layer). */
export async function createBackgroundPlateDataUrl(
  sourceDataUrl: string,
  options: BackgroundPlateOptions = {}
): Promise<string> {
  const size = options.size ?? 1024;
  const blurPx = options.blurPx ?? 32;
  const theme = options.theme ?? "original_blurred";

  const image = await loadImage(sourceDataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas context is unavailable.");
  }

  const scale = Math.max(size / image.width, size / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  const offsetX = (size - drawWidth) / 2;
  const offsetY = (size - drawHeight) / 2;

  if (theme === "original") {
    context.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);
    return canvas.toDataURL("image/jpeg", 0.92);
  }

  const blurStrength = theme === "original_blurred" ? blurPx : Math.max(blurPx, 24);
  context.filter = `blur(${blurStrength}px) saturate(1.2) brightness(1.06)`;
  context.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);
  context.filter = "none";

  const overlaySeed =
    sourceDataUrl.length +
    sourceDataUrl.charCodeAt(Math.min(32, sourceDataUrl.length - 1)) +
    theme.length;
  applyThemeOverlay(context, theme, size, overlaySeed);

  return canvas.toDataURL("image/jpeg", 0.88);
}

/** Bake themed background + cutout onto one cube face texture. */
export async function createFaceCompositeDataUrl(
  fgDataUrl: string,
  bgPlateDataUrl: string,
  size = 1024
): Promise<string> {
  const [fg, bg] = await Promise.all([loadImage(fgDataUrl), loadImage(bgPlateDataUrl)]);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas context is unavailable.");
  }

  context.drawImage(bg, 0, 0, size, size);
  const fgScale = Math.min(size / fg.width, size / fg.height) * 0.94;
  const drawW = fg.width * fgScale;
  const drawH = fg.height * fgScale;
  const offsetX = (size - drawW) / 2;
  const offsetY = (size - drawH) / 2;
  context.drawImage(fg, offsetX, offsetY, drawW, drawH);

  return canvas.toDataURL("image/png");
}

/** Rebuild parallax background plates from original uploads with a new theme. */
export async function regenerateBackgroundPlates(
  images: ProcessedImage[],
  sourceUrls: string[],
  theme: BackgroundPlateTheme
): Promise<ProcessedImage[]> {
  return Promise.all(
    images.map(async (image, index) => {
      const sourceUrl =
        sourceUrls[index] ?? image.originalUrl ?? image.preCropSourceUrl ?? image.url;
      if (!sourceUrl) {
        return image;
      }
      const backgroundPlateUrl = await createBackgroundPlateDataUrl(sourceUrl, { theme });
      const faceCompositeUrl =
        image.preprocessMode === "background_removed"
          ? await createFaceCompositeDataUrl(image.url, backgroundPlateUrl)
          : image.url;
      return {
        ...image,
        backgroundPlateUrl,
        faceCompositeUrl,
        byteSize:
          estimateDataUrlBytes(image.url) +
          estimateDataUrlBytes(image.preparedUrl) +
          estimateDataUrlBytes(backgroundPlateUrl) +
          estimateDataUrlBytes(faceCompositeUrl),
      };
    })
  );
}
