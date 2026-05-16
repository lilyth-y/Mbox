import type { ProcessedImage } from "../../shared/types";

const CATEGORY_CATALOG_KEY = "mbox.categoryCatalog";
const categoryAssignmentsKey = (eventId: string) => `mbox.categoryAssignments.${eventId}`;

interface CategoryAssignmentRecord {
  userCategory?: string;
}

type CategoryAssignmentMap = Record<string, CategoryAssignmentRecord>;

export function loadCategoryCatalog(): string[] | null {
  try {
    const raw = localStorage.getItem(CATEGORY_CATALOG_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return null;
    }
    return parsed.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
  } catch {
    return null;
  }
}

export function saveCategoryCatalog(categories: string[]): void {
  try {
    localStorage.setItem(CATEGORY_CATALOG_KEY, JSON.stringify(categories));
  } catch {
    // Ignore quota or private-mode storage failures.
  }
}

export function loadCategoryAssignments(eventId: string): CategoryAssignmentMap {
  try {
    const raw = localStorage.getItem(categoryAssignmentsKey(eventId));
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return {};
    }
    return parsed as CategoryAssignmentMap;
  } catch {
    return {};
  }
}

export function saveCategoryAssignments(images: ProcessedImage[], eventId: string): void {
  const assignments: CategoryAssignmentMap = {};
  for (const image of images) {
    if (image.userCategory) {
      assignments[String(image.id)] = { userCategory: image.userCategory };
    }
  }

  try {
    localStorage.setItem(categoryAssignmentsKey(eventId), JSON.stringify(assignments));
  } catch {
    // Ignore quota or private-mode storage failures.
  }
}

export function applyStoredCategoryAssignments(
  images: ProcessedImage[],
  eventId: string
): ProcessedImage[] {
  const assignments = loadCategoryAssignments(eventId);
  return images.map((image) => {
    const stored = assignments[String(image.id)];
    if (!stored?.userCategory) {
      return image;
    }
    return {
      ...image,
      userCategory: stored.userCategory,
    };
  });
}
