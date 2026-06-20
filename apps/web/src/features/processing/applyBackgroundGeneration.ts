import type { BackgroundTemplateId, ProcessedImage } from "../../shared/types";
import { editImageBackground } from "../../shared/api/client";
import { composeBackgroundPrompt } from "../background/backgroundTemplates";
import { cropImage } from "../../shared/lib/cropImage";
import { estimateDataUrlBytes } from "../../shared/lib/mediaLimits";
import { prepareImageForApi } from "../../shared/lib/prepareImageForApi";

interface ApplyBackgroundGenerationOptions {
  onStatus?: (message: string) => void;
}

export async function applyBackgroundGeneration(
  image: ProcessedImage,
  templateId: BackgroundTemplateId,
  customPrompt: string,
  options: ApplyBackgroundGenerationOptions = {}
): Promise<ProcessedImage> {
  const onStatus = options.onStatus;
  const sourceUrl = image.preparedUrl ?? image.url;
  const prompt = composeBackgroundPrompt(templateId, customPrompt);
  const prepared = await prepareImageForApi(sourceUrl);

  onStatus?.(`[${image.label}] 배경 생성 중...`);
  const editResult = await editImageBackground(
    prepared.base64,
    image.label,
    prompt,
    prepared.mimeType,
    "generate_background"
  );

  onStatus?.(`[${image.label}] 배경 생성 결과를 1024x1024로 맞추는 중...`);
  const editedUrl = `data:${editResult.mimeType};base64,${editResult.imageBase64}`;
  const cropped = await cropImage(editedUrl, image.center, image.focus, image.subject.bounds);

  return {
    ...image,
    preCropSourceUrl: editedUrl,
    preparedUrl: cropped,
    url: cropped,
    byteSize: estimateDataUrlBytes(cropped),
    backgroundGeneration: {
      templateId,
      prompt,
      customPrompt: customPrompt.trim(),
      applied: true,
    },
  };
}
