import type { ProcessedImage } from "../../shared/types";
import { estimateDataUrlBytes } from "../../shared/lib/mediaLimits";
import {
  createBackgroundPlateDataUrl,
  type BackgroundPlateTheme,
} from "../../shared/lib/backgroundPlate";

interface ApplyPresentationPrepareOptions {
  onStatus?: (message: string) => void;
  backgroundPlateTheme?: BackgroundPlateTheme;
}

interface ApplyPresentationPrepareBatchOptions extends ApplyPresentationPrepareOptions {
  onProgress?: (current: number, total: number, message: string) => void;
}

/**
 * Prepares wedding/cube presentation without background removal (full photo on cube faces).
 */
export async function applyPresentationPrepare(
  image: ProcessedImage,
  options: ApplyPresentationPrepareOptions = {}
): Promise<ProcessedImage> {
  const onStatus = options.onStatus;
  const sourceUrl = image.preCropSourceUrl ?? image.originalUrl ?? image.url;

  onStatus?.(`[${image.label}] 연출용 텍스처 준비 중...`);
  const backgroundPlateUrl = await createBackgroundPlateDataUrl(sourceUrl, {
    theme: options.backgroundPlateTheme,
  });

  const faceTextureUrl = image.url;
  const byteSize =
    estimateDataUrlBytes(faceTextureUrl) +
    estimateDataUrlBytes(backgroundPlateUrl);

  return {
    ...image,
    preparedUrl: image.preparedUrl ?? image.url,
    url: faceTextureUrl,
    backgroundPlateUrl,
    faceCompositeUrl: faceTextureUrl,
    preprocessMode: "original",
    byteSize,
  };
}

export async function applyPresentationPrepareBatch(
  images: ProcessedImage[],
  options: ApplyPresentationPrepareBatchOptions = {}
): Promise<ProcessedImage[]> {
  const total = images.length;
  const results: ProcessedImage[] = [];

  for (let index = 0; index < images.length; index += 1) {
    const image = images[index];
    if (!image) {
      continue;
    }
    const message = `[${index + 1}/${total}] ${image.label} 연출 준비 중...`;
    options.onStatus?.(message);
    options.onProgress?.(index, total, message);
    results.push(await applyPresentationPrepare(image, options));
    options.onProgress?.(index + 1, total, `[${index + 1}/${total}] ${image.label} 완료`);
  }

  return results;
}
