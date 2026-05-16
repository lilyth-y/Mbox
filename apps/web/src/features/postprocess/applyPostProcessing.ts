import type { ImageCenter, ProcessedImage } from "../../shared/types";
import { cropImage } from "../../shared/lib/cropImage";
import { applyImagePostProcessing } from "../../shared/lib/imagePostProcess";
import { estimateDataUrlBytes } from "../../shared/lib/mediaLimits";
import { DEFAULT_POST_PROCESSING } from "./afterEffectCatalog";

export async function refocusProcessedImage(
  image: ProcessedImage,
  center: ImageCenter
): Promise<ProcessedImage> {
  const preCropSourceUrl = image.preCropSourceUrl ?? image.preparedUrl;
  const cropped = await cropImage(preCropSourceUrl, center, image.focus);
  const postProcessing = image.postProcessing ?? DEFAULT_POST_PROCESSING;
  const hasPostProcessing = Object.entries(postProcessing).some(
    ([key, value]) => key in DEFAULT_POST_PROCESSING && value !== 0
  );
  const finalUrl = hasPostProcessing
    ? await applyImagePostProcessing(cropped, postProcessing)
    : cropped;

  return {
    ...image,
    center,
    preparedUrl: cropped,
    url: finalUrl,
    byteSize: estimateDataUrlBytes(finalUrl),
  };
}

export async function applyPostProcessingToImage(
  image: ProcessedImage,
  postProcessing = image.postProcessing ?? DEFAULT_POST_PROCESSING
): Promise<ProcessedImage> {
  const finalUrl = await applyImagePostProcessing(image.preparedUrl, postProcessing);

  return {
    ...image,
    postProcessing,
    url: finalUrl,
    byteSize: estimateDataUrlBytes(finalUrl),
  };
}
