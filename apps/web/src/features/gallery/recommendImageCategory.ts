import type { ProcessedImage } from "../../shared/types";
import {
  ensureCategoryListed,
  getEffectiveCategory,
  IMAGE_CATEGORY_OPTIONS,
  UNASSIGNED_CATEGORY_LABEL,
} from "@mbox/shared";

export {
  ensureCategoryListed,
  getEffectiveCategory,
  IMAGE_CATEGORY_OPTIONS,
  UNASSIGNED_CATEGORY_LABEL,
};

export const DEFAULT_IMAGE_CATEGORIES = IMAGE_CATEGORY_OPTIONS;

export function getCategoryCounts(
  categories: string[],
  images: ProcessedImage[]
): Array<{ category: string; count: number }> {
  const counts = new Map<string, number>();
  for (const category of categories) {
    counts.set(category, 0);
  }
  counts.set(UNASSIGNED_CATEGORY_LABEL, 0);

  for (const image of images) {
    const effectiveCategory = getEffectiveCategory(image);
    counts.set(effectiveCategory, (counts.get(effectiveCategory) ?? 0) + 1);
  }

  const ordered = categories.map((category) => ({
    category,
    count: counts.get(category) ?? 0,
  }));

  return [
    ...ordered,
    {
      category: UNASSIGNED_CATEGORY_LABEL,
      count: counts.get(UNASSIGNED_CATEGORY_LABEL) ?? 0,
    },
  ];
}
