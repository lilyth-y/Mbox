import type { AnalysisMetadata } from "./analysis-types.js";
import { IMAGE_CATEGORY_OPTIONS, UNASSIGNED_CATEGORY_LABEL } from "./categories.js";

export interface CategoryAssignmentFields {
  userCategory?: string;
}

export interface CategorySuggestionSource {
  label: string;
  category: string;
  categoryConfidence: number;
  subject: AnalysisMetadata["subject"];
  focus: AnalysisMetadata["focus"];
  focusTarget?: string;
}

function normalizeText(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

function includesAny(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword));
}

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}

export function normalizeModelCategory(category: string | undefined): string | null {
  const normalized = category?.trim();
  if (!normalized) {
    return null;
  }
  if ((IMAGE_CATEGORY_OPTIONS as readonly string[]).includes(normalized)) {
    return normalized;
  }
  if (normalized === "자연") {
    return "풍경";
  }
  if (normalized === "추상" || normalized === "기본") {
    return "기타";
  }
  return null;
}

export function normalizeCategoryConfidence(raw: unknown): number {
  return clampConfidence(Number(raw));
}

export function recommendImageCategoryFromSignals(
  source: Pick<AnalysisMetadata, "label" | "category" | "subject" | "focus"> & {
    focusTarget?: string;
  }
): string {
  const subjectLabel = normalizeText(source.subject.detectedLabel);
  const requestedTarget = normalizeText(source.subject.requestedTarget);
  const label = normalizeText(source.label);
  const focusTarget = normalizeText(source.focusTarget);
  const combined = `${subjectLabel} ${requestedTarget} ${label} ${focusTarget}`;

  if (includesAny(combined, ["couple", "커플", "wedding", "신랑", "신부", "웨딩"])) {
    return "커플";
  }
  if (includesAny(combined, ["food", "음식", "meal", "dish", "요리", "디저트", "카페"])) {
    return "음식";
  }
  if (includesAny(combined, ["dog", "cat", "pet", "강아지", "고양이", "반려", "puppy"])) {
    return "반려동물";
  }
  if (includesAny(combined, ["family", "가족", "아이", "child", "kid", "부모"])) {
    return "가족";
  }
  if (includesAny(combined, ["landscape", "mountain", "sea", "풍경", "바다", "산", "city", "도시"])) {
    return "풍경";
  }
  if (includesAny(combined, ["event", "party", "행사", "공연", "축하", "concert"])) {
    return "행사";
  }
  if (source.subject.detected || includesAny(combined, ["person", "인물", "portrait", "face", "people"])) {
    return "인물";
  }

  if (source.category === "자연") {
    return "풍경";
  }
  if (source.category === "추상") {
    return "기타";
  }

  return "기타";
}

export function resolveSuggestedCategory(
  source: CategorySuggestionSource
): { category: string; confidence: number } {
  const heuristicCategory = recommendImageCategoryFromSignals({
    label: source.label,
    category: source.category,
    subject: source.subject,
    focus: source.focus,
    focusTarget: source.focusTarget,
  });
  const apiCategory = normalizeModelCategory(source.category);
  const apiConfidence = normalizeCategoryConfidence(source.categoryConfidence);

  if (!apiCategory) {
    return { category: heuristicCategory, confidence: 0.25 };
  }

  if (apiCategory === "기타" && heuristicCategory !== "기타" && apiConfidence < 0.7) {
    return {
      category: heuristicCategory,
      confidence: Math.max(0.3, Math.min(apiConfidence || 0.35, 0.55)),
    };
  }

  if (apiCategory !== "기타" || apiConfidence >= 0.35) {
    return {
      category: apiCategory,
      confidence: apiConfidence > 0 ? apiConfidence : 0.5,
    };
  }

  return {
    category: heuristicCategory,
    confidence: apiConfidence > 0 ? apiConfidence : 0.25,
  };
}

export function getEffectiveCategory(image: CategoryAssignmentFields): string {
  return image.userCategory ?? UNASSIGNED_CATEGORY_LABEL;
}

export function ensureCategoryListed(categories: string[], category: string): string[] {
  return categories.includes(category) ? categories : [...categories, category];
}
