import type { ProcessedImage } from "../types";

/** True after Gemini background removal (누끼) has been applied. */
export function hasSubjectCutout(
  image: Pick<ProcessedImage, "preprocessMode">
): boolean {
  return image.preprocessMode === "background_removed";
}

/** 3D subject/background parallax is only meaningful on cutout images. */
export function canUseSubjectBackgroundSeparation(
  image: Pick<ProcessedImage, "preprocessMode">
): boolean {
  return hasSubjectCutout(image);
}

export function countSubjectCutouts(images: ProcessedImage[]): number {
  return images.filter((image) => hasSubjectCutout(image)).length;
}
