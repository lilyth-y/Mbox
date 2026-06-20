import type { ResolutionEnhanceScale } from "@mbox/shared";
import type { ProcessedImage } from "../../shared/types";
import {
  createBackgroundPlateDataUrl,
  createFaceCompositeDataUrl,
} from "../../shared/lib/backgroundPlate";
import { estimateDataUrlBytes } from "../../shared/lib/mediaLimits";
import { upscaleImageDataUrl } from "./upscaleImage";

export interface ApplyResolutionEnhanceOptions {
  scale?: ResolutionEnhanceScale;
  onProgress?: (current: number, total: number, message: string) => void;
  backgroundPlateTheme?: import("../../shared/lib/backgroundPlate").BackgroundPlateTheme;
}

export async function applyResolutionEnhance(
  image: ProcessedImage,
  options: ApplyResolutionEnhanceOptions = {}
): Promise<ProcessedImage> {
  const scale = options.scale ?? 2;
  if (image.resolutionEnhanceScale === scale) {
    return image;
  }

  const sourceForUpscale = image.preparedUrl || image.url;
  const upscaledUrl = await upscaleImageDataUrl(sourceForUpscale, scale);

  let backgroundPlateUrl = image.backgroundPlateUrl;
  const plateSource = image.preCropSourceUrl ?? image.originalUrl;
  if (plateSource) {
    const upscaledPlateSource = await upscaleImageDataUrl(plateSource, scale);
    backgroundPlateUrl = await createBackgroundPlateDataUrl(upscaledPlateSource, {
      theme: options.backgroundPlateTheme,
      center: image.center,
      focus: image.focus,
    });
  }

  const faceCompositeUrl =
    backgroundPlateUrl != null
      ? await createFaceCompositeDataUrl(upscaledUrl, backgroundPlateUrl)
      : image.faceCompositeUrl;

  return {
    ...image,
    url: upscaledUrl,
    preparedUrl: upscaledUrl,
    preCropSourceUrl: image.preCropSourceUrl
      ? await upscaleImageDataUrl(image.preCropSourceUrl, scale)
      : image.preCropSourceUrl,
    backgroundPlateUrl,
    faceCompositeUrl,
    resolutionEnhanceScale: scale,
    byteSize:
      estimateDataUrlBytes(upscaledUrl) +
      estimateDataUrlBytes(backgroundPlateUrl ?? "") +
      estimateDataUrlBytes(faceCompositeUrl ?? "") +
      estimateDataUrlBytes(image.preCropSourceUrl ?? ""),
  };
}

export async function applyResolutionEnhanceBatch(
  images: ProcessedImage[],
  options: ApplyResolutionEnhanceOptions = {}
): Promise<ProcessedImage[]> {
  const scale = options.scale ?? 2;
  const pending = images.filter((image) => image.resolutionEnhanceScale !== scale);
  if (pending.length === 0) {
    return images;
  }

  const byId = new Map(images.map((image) => [image.id, image]));
  let current = 0;

  for (const image of pending) {
    current += 1;
    options.onProgress?.(
      current,
      pending.length,
      `[${current}/${pending.length}] ${image.label} 해상도 ${scale}x 향상 중...`
    );
    const updated = await applyResolutionEnhance(image, { scale });
    byId.set(updated.id, updated);
  }

  return images.map((image) => byId.get(image.id) ?? image);
}
