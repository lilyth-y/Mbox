import type { ProcessedImage } from "../../shared/types";
import { editImageBackground } from "../../shared/api/client";
import { cropImage } from "../../shared/lib/cropImage";
import { estimateDataUrlBytes } from "../../shared/lib/mediaLimits";
import { prepareImageForApi } from "../../shared/lib/prepareImageForApi";

interface ApplyBackgroundRemovalOptions {
  onStatus?: (message: string) => void;
}

export async function applyBackgroundRemoval(
  image: ProcessedImage,
  options: ApplyBackgroundRemovalOptions = {}
): Promise<ProcessedImage> {
  const onStatus = options.onStatus;
  const sourceUrl = image.preCropSourceUrl ?? image.originalUrl;
  const prepared = await prepareImageForApi(sourceUrl);

  onStatus?.(`[${image.label}] 배경 제거 중...`);
  const editResult = await editImageBackground(
    prepared.base64,
    image.label,
    "",
    prepared.mimeType,
    "remove_background"
  );

  onStatus?.(`[${image.label}] 배경 제거 결과를 1024x1024로 맞추는 중...`);
  const editedUrl = `data:${editResult.mimeType};base64,${editResult.imageBase64}`;
  const cropped = await cropImage(editedUrl, image.center, image.focus);

  return {
    ...image,
    preCropSourceUrl: editedUrl,
    preparedUrl: cropped,
    url: cropped,
    preprocessMode: "background_removed",
    byteSize: estimateDataUrlBytes(cropped),
  };
}
