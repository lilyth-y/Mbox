import type { ProcessedImage } from "../types";

const PERSON_LABEL_PATTERN =
  /인물|사람|person|people|portrait|human|남성|여성|모델|face|얼굴/i;

/** Use stronger foreground/background parallax in the 3D viewer. */
export function hasDepthSeparationBoost(
  image: Pick<ProcessedImage, "subject" | "focus">
): boolean {
  if (isPortraitSubject(image)) {
    return true;
  }
  return image.focus.onPrimarySubject && image.subject.detected;
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
