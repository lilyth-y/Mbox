import type { PostProcessingSettings, ProcessedImage } from "../../shared/types";
import { DEFAULT_POST_PROCESSING } from "./afterEffectCatalog";
import { getEffectiveCategory, UNASSIGNED_CATEGORY_LABEL } from "@mbox/shared";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function recommendPostProcessing(image: ProcessedImage): PostProcessingSettings {
  const settings: PostProcessingSettings = { ...DEFAULT_POST_PROCESSING };
  const effectiveCategory = getEffectiveCategory(image);
  const category =
    effectiveCategory === UNASSIGNED_CATEGORY_LABEL ? image.aiSuggestedCategory : effectiveCategory;

  if (category === "풍경") {
    settings.saturation = 8;
    settings.warmth = 6;
    settings.vignette = 12;
  } else if (category === "기타") {
    settings.contrast = 10;
    settings.saturation = 6;
    settings.sharpness = 6;
  } else {
    settings.brightness = 3;
    settings.shadowLift = 8;
  }

  if (image.focus.aestheticScore >= 4) {
    settings.contrast = clamp(settings.contrast + 4, -40, 40);
    settings.sharpness = clamp(settings.sharpness + 4, 0, 40);
  } else if (image.focus.aestheticScore <= 2) {
    settings.brightness = clamp(settings.brightness + 4, -40, 40);
    settings.shadowLift = clamp(settings.shadowLift + 6, 0, 40);
  }

  if (!image.subject.detected) {
    settings.brightness = clamp(settings.brightness + 3, -40, 40);
    settings.contrast = clamp(settings.contrast - 4, -40, 40);
  }

  if (image.preprocessMode === "background_removed") {
    settings.vignette = clamp(settings.vignette + 6, 0, 60);
    settings.shadowLift = clamp(settings.shadowLift + 4, 0, 40);
  }

  if (image.backgroundGeneration?.applied) {
    settings.saturation = clamp(settings.saturation + 4, -50, 50);
    settings.warmth = clamp(settings.warmth + 4, -40, 40);
  }

  return settings;
}
