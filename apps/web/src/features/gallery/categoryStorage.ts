import type { ProcessedImage } from "../../shared/types";
import { WORKSPACE_ID } from "../../shared/config/runtime";
import {
  categoryAssignmentsStorageKey,
  categoryCatalogStorageKey,
  legacyCategoryAssignmentsKey,
  LEGACY_CATEGORY_CATALOG_KEY,
  migrateLegacyLocalStorageValue,
} from "../../shared/lib/workspaceLocalKeys";

interface CategoryAssignmentRecord {
  userCategory?: string;
}

type CategoryAssignmentMap = Record<string, CategoryAssignmentRecord>;

export function loadCategoryCatalog(): string[] | null {
  try {
    const raw = migrateLegacyLocalStorageValue(
      categoryCatalogStorageKey(WORKSPACE_ID),
      LEGACY_CATEGORY_CATALOG_KEY,
      WORKSPACE_ID
    );
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
    localStorage.setItem(categoryCatalogStorageKey(WORKSPACE_ID), JSON.stringify(categories));
  } catch {
    // Ignore quota or private-mode storage failures.
  }
}

export function loadCategoryAssignments(eventId: string): CategoryAssignmentMap {
  try {
    const scopedKey = categoryAssignmentsStorageKey(eventId, WORKSPACE_ID);
    const raw = migrateLegacyLocalStorageValue(scopedKey, legacyCategoryAssignmentsKey(eventId), WORKSPACE_ID);
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
    localStorage.setItem(categoryAssignmentsStorageKey(eventId, WORKSPACE_ID), JSON.stringify(assignments));
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
