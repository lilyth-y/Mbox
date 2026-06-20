import { IMAGE_SIZE } from "../constants";
import type { ImageCenter, ImageFocus, SubjectBounds } from "../types";
import { computeCropBounds } from "./cropBounds";

export function extractBase64(dataUrl: string): string {
  const [, base64] = dataUrl.split(",");
  if (!base64) {
    throw new Error("Invalid image data URL.");
  }
  return base64;
}

export function cropImage(
  url: string,
  center: ImageCenter,
  focus?: ImageFocus,
  subjectBounds?: SubjectBounds
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = IMAGE_SIZE;
      canvas.height = IMAGE_SIZE;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas context is unavailable."));
        return;
      }

      const { sx, sy, size } = computeCropBounds(
        img.width,
        img.height,
        center,
        focus,
        subjectBounds
      );

      ctx.drawImage(img, sx, sy, size, size, 0, 0, IMAGE_SIZE, IMAGE_SIZE);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => reject(new Error("Failed to load image for cropping."));
    img.src = url;
  });
}
