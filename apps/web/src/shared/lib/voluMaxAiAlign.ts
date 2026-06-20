import { IMAGE_SIZE } from "../constants";
import type { ImageCenter, ImageFocus, ProcessedImage } from "../types";
import { cropImage } from "./cropImage";
import {
  removeBackgroundForImage,
  type BackgroundRemovalResult,
} from "./removeBackground";

/** Trim cutout halos / leftover frame alpha on PNG mattes. */
export async function defringeCutoutDataUrl(dataUrl: string, alphaFloor = 0.12): Promise<string> {
  if (!dataUrl.startsWith("data:image/png")) {
    return dataUrl;
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas context is unavailable."));
        return;
      }
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const { data } = imageData;
      for (let i = 0; i < data.length; i += 4) {
        const a = data[i + 3]! / 255;
        if (a <= alphaFloor) {
          data[i] = 0;
          data[i + 1] = 0;
          data[i + 2] = 0;
          data[i + 3] = 0;
          continue;
        }
        const scale = 1 / a;
        data[i] = Math.min(255, data[i]! * scale);
        data[i + 1] = Math.min(255, data[i + 1]! * scale);
        data[i + 2] = Math.min(255, data[i + 2]! * scale);
      }
      ctx.putImageData(imageData, 0, 0);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => reject(new Error("Failed to load cutout for defringe."));
    img.src = dataUrl;
  });
}

async function normalizeSquarePng(dataUrl: string): Promise<string> {
  if (!dataUrl.startsWith("data:image/png")) {
    return dataUrl;
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      if (img.width === IMAGE_SIZE && img.height === IMAGE_SIZE) {
        resolve(dataUrl);
        return;
      }
      const canvas = document.createElement("canvas");
      canvas.width = IMAGE_SIZE;
      canvas.height = IMAGE_SIZE;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas context is unavailable."));
        return;
      }
      ctx.drawImage(img, 0, 0, IMAGE_SIZE, IMAGE_SIZE);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => reject(new Error("Failed to normalize matte size."));
    img.src = dataUrl;
  });
}

export interface AlignedVoluMaxAiLayers {
  faceSquareUrl: string;
  subjectForegroundUrl: string;
  /** Full-frame cutout before square crop — refocus / re-crop without re-running AI. */
  subjectMatteSourceUrl: string;
}

/**
 * Face square and AI matte share the same 1024 crop — fixes zoom / resolution mismatch.
 */
export async function buildAlignedVoluMaxAiLayers(
  image: ProcessedImage,
  originalSourceUrl: string,
  center: ImageCenter,
  focus: ImageFocus | undefined,
  onStatus?: (message: string) => void,
  removeBg: typeof removeBackgroundForImage = removeBackgroundForImage
): Promise<AlignedVoluMaxAiLayers> {
  const faceSquareUrl = await cropImage(
    originalSourceUrl,
    center,
    focus,
    image.subject.bounds
  );
  const editResult: BackgroundRemovalResult = await removeBg(
    image,
    faceSquareUrl,
    onStatus,
    { preserveSquareCrop: true }
  );
  const rawMatte = `data:${editResult.mimeType};base64,${editResult.imageBase64}`;
  const defringed = await defringeCutoutDataUrl(rawMatte);
  const subjectForegroundUrl = await normalizeSquarePng(defringed);
  return {
    faceSquareUrl,
    subjectForegroundUrl,
    subjectMatteSourceUrl: subjectForegroundUrl,
  };
}
