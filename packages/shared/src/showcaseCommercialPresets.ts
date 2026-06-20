/** Beta-sales commercial looks — preset-only workflow (no slider tuning required). */

export type ShowcaseCommercialLookId =
  | "rose_gold_premium"
  | "classic"
  | "modern_black";

export type ShowcaseCommercialLookMeta = {
  id: ShowcaseCommercialLookId;
  labelKo: string;
  summaryKo: string;
};

export const SHOWCASE_COMMERCIAL_LOOK_PRESETS: ShowcaseCommercialLookMeta[] = [
  {
    id: "rose_gold_premium",
    labelKo: "로즈골드 프리미엄",
    summaryKo: "웨딩 부스·럭셔리 블랙 배경, 두꺼운 웜 크리스탈",
  },
  {
    id: "classic",
    labelKo: "클래식",
    summaryKo: "펄 프레임·소프트 그레이, 은은한 아이스 크리스탈",
  },
  {
    id: "modern_black",
    labelKo: "모던 블랙",
    summaryKo: "블랙 프레임·풀 블랙 배경, 하이글로ss 다크 글래스",
  },
];

export const SHOWCASE_COMMERCIAL_LOOK_COUNT = SHOWCASE_COMMERCIAL_LOOK_PRESETS.length;

export const SHOWCASE_COMMERCIAL_LOOK_IDS = SHOWCASE_COMMERCIAL_LOOK_PRESETS.map(
  (p) => p.id
) as ShowcaseCommercialLookId[];

export function isShowcaseCommercialLookId(raw: string | null | undefined): raw is ShowcaseCommercialLookId {
  return SHOWCASE_COMMERCIAL_LOOK_IDS.includes(raw as ShowcaseCommercialLookId);
}
