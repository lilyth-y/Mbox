import type { ProcessedImageRef } from "@mbox/shared";

import type { ProcessedImage } from "../../shared/types";

/** Map in-browser showcase images to cloud render job refs. */
export function buildShowcaseRenderImageRefs(images: ProcessedImage[]): ProcessedImageRef[] {
  return images.map((image) => ({
    id: String(image.id),
    url: image.preparedUrl || image.url,
  }));
}
