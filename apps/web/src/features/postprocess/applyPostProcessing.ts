import type { ImageCenter, ProcessedImage } from "../../shared/types";
import { cropImage } from "../../shared/lib/cropImage";
import { applyImagePostProcessing } from "../../shared/lib/imagePostProcess";
import { estimateDataUrlBytes } from "../../shared/lib/mediaLimits";
import { defringeCutoutDataUrl } from "../../shared/lib/voluMaxAiAlign";
import { DEFAULT_POST_PROCESSING } from "./afterEffectCatalog";

export async function refocusProcessedImage(
  image: ProcessedImage,
  center: ImageCenter
): Promise<ProcessedImage> {
  const photoSource =
    image.preprocessMode === "volumax" || image.preprocessMode === "original"
      ? image.preCropSourceUrl ?? image.originalUrl ?? image.preparedUrl
      : image.preCropSourceUrl ?? image.preparedUrl;
  const cropped = await cropImage(photoSource, center, image.focus, image.subject.bounds);
  const postProcessing = image.postProcessing ?? DEFAULT_POST_PROCESSING;
  const hasPostProcessing = Object.entries(postProcessing).some(
    ([key, value]) => key in DEFAULT_POST_PROCESSING && value !== 0
  );
  const finalUrl = hasPostProcessing
    ? await applyImagePostProcessing(cropped, postProcessing)
    : cropped;

  let subjectForegroundUrl = image.subjectForegroundUrl;
  const subjectMatteSourceUrl = image.subjectMatteSourceUrl;
  const matteSource = subjectMatteSourceUrl;
  const canRecropMatte =
    Boolean(matteSource) &&
    image.voluMaxForegroundKind === "ai_cutout" &&
    matteSource !== image.subjectForegroundUrl;
  if (canRecropMatte && matteSource) {
    const matteCropped = await cropImage(matteSource, center, image.focus, image.subject.bounds);
    subjectForegroundUrl = await defringeCutoutDataUrl(matteCropped);
  }

  const byteSize =
    estimateDataUrlBytes(finalUrl) +
    (subjectForegroundUrl ? estimateDataUrlBytes(subjectForegroundUrl) : 0);

  return {
    ...image,
    center,
    preparedUrl: cropped,
    url: finalUrl,
    subjectForegroundUrl,
    subjectMatteSourceUrl,
    byteSize,
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
