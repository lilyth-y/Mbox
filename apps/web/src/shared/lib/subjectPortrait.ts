import type { ProcessedImage } from "../types";
import { canUseDualLayerParallax } from "./cutoutPresentation";

const PERSON_LABEL_PATTERN =
  /인물|사람|person|people|portrait|human|남성|여성|모델|face|얼굴/i;

/** Use stronger foreground/background parallax (cutout or original + background plate). */
export function hasDepthSeparationBoost(
  image: Pick<ProcessedImage, "subject" | "focus" | "preprocessMode" | "backgroundPlateUrl" | "depth">
): boolean {
  if (image.preprocessMode === "background_removed") {
    if (isPortraitSubject(image)) {
      return true;
    }
    return image.subject.detected || image.focus.onPrimarySubject;
  }
  if (
    canUseDualLayerParallax(image) &&
    image.backgroundPlateUrl &&
    (image.subject.detected || image.focus.onPrimarySubject || image.depth)
  ) {
    return true;
  }
  return false;
}

export function isPortraitSubject(image: Pick<ProcessedImage, "subject" | "focus">): boolean {
  if (!image.subject.detected) {
    return false;
  }
  if (PERSON_LABEL_PATTERN.test(image.subject.detectedLabel)) {
    return true;
  }
  if (!image.focus.onPrimarySubject) {
    return false;
  }
  const { x0, y0, x1, y1 } = image.subject.bounds;
  const width = Math.max(1, x1 - x0);
  const height = Math.max(1, y1 - y0);
  const aspect = height / width;
  return aspect > 0.85 && height >= 18;
}
