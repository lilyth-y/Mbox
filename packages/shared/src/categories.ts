export const IMAGE_CATEGORY_OPTIONS = [
  "인물",
  "커플",
  "가족",
  "반려동물",
  "음식",
  "풍경",
  "행사",
  "기타",
] as const;

export type ImageCategory = (typeof IMAGE_CATEGORY_OPTIONS)[number];

export const UNASSIGNED_CATEGORY_LABEL = "미분류";
