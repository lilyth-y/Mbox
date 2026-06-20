/** Decorative ring around the circular hologram fan viewport — not cube face frames. */
export type FanBladeFrameId =
  | "rose_gold_ring"
  | "pearl_ring"
  | "classic_black_ring"
  | "sage_garden_ring"
  | "royal_navy_ring";

export const FAN_BLADE_FRAME_IDS = [
  "rose_gold_ring",
  "pearl_ring",
  "classic_black_ring",
  "sage_garden_ring",
  "royal_navy_ring",
] as const satisfies readonly FanBladeFrameId[];

export interface FanBladeFramePreset {
  id: FanBladeFrameId;
  label: string;
  description: string;
}

export interface FanBladeBackdropColor {
  id: string;
  label: string;
  hex: string;
}

export const FAN_BLADE_FRAME_PRESETS: FanBladeFramePreset[] = [
  {
    id: "rose_gold_ring",
    label: "로즈골드 링",
    description: "장미 garland · 금빛 스파클",
  },
  {
    id: "pearl_ring",
    label: "펄 실버",
    description: "원형 진주 · 실버 하이라이트",
  },
  {
    id: "classic_black_ring",
    label: "클래식 블랙",
    description: "골드 filigree · 럭셔리 포인트",
  },
  {
    id: "sage_garden_ring",
    label: "세이지 가든",
    description: "잎·꽃 보타니컬 wreath",
  },
  {
    id: "royal_navy_ring",
    label: "로열 네이비",
    description: "별·크라운 포인트 · 골드 림",
  },
];

/** Solid fill inside the circular frame (behind transparent cutouts). */
export const FAN_BLADE_BACKDROP_PALETTE: FanBladeBackdropColor[] = [
  { id: "warm_ivory", label: "웜 아이보리", hex: "#FFF8F2" },
  { id: "soft_blush", label: "소프트 핑크", hex: "#F9E8E8" },
  { id: "champagne", label: "샴페인", hex: "#F5E6D3" },
  { id: "pearl_gray", label: "펄 그레이", hex: "#E8EAED" },
  { id: "sage_mist", label: "세이지 미스트", hex: "#E4EDE4" },
  { id: "sky_veil", label: "스카이 베일", hex: "#E8EEF5" },
  { id: "deep_wine", label: "딥 와인", hex: "#2A1218" },
  { id: "midnight", label: "미드나잇", hex: "#0F1420" },
  { id: "pure_black", label: "순흑", hex: "#000000" },
];

export const DEFAULT_FAN_BLADE_FRAME_ID: FanBladeFrameId = "rose_gold_ring";
export const DEFAULT_FAN_BLADE_BACKDROP_COLOR_ID = "warm_ivory";

export function resolveFanBladeBackdropHex(colorId?: string | null): string {
  const match = FAN_BLADE_BACKDROP_PALETTE.find((entry) => entry.id === colorId);
  return match?.hex ?? FAN_BLADE_BACKDROP_PALETTE[0]!.hex;
}

export function getFanBladeFramePreset(id: FanBladeFrameId): FanBladeFramePreset {
  return FAN_BLADE_FRAME_PRESETS.find((preset) => preset.id === id) ?? FAN_BLADE_FRAME_PRESETS[0]!;
}
