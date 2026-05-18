import type { CubeFramePresetId } from "@mbox/shared";

export interface CubeFramePresetDefinition {
  id: CubeFramePresetId;
  label: string;
  description: string;
  /** Shader uniform index 0–4 */
  index: number;
  sceneBackground: number;
  swatchClass: string;
}

export const CUBE_FRAME_PRESETS: CubeFramePresetDefinition[] = [
  {
    id: "rose_gold",
    label: "로즈골드",
    description: "웨딩 시그니처 · 아이보리 매트",
    index: 0,
    sceneBackground: 0x1c1418,
    swatchClass: "from-rose-300/80 via-amber-200/70 to-rose-400/80",
  },
  {
    id: "pearl_white",
    label: "펄 화이트",
    description: "밝은 실버·화이트 클래식",
    index: 1,
    sceneBackground: 0x16181c,
    swatchClass: "from-slate-100 via-white to-slate-300",
  },
  {
    id: "classic_black",
    label: "클래식 블랙",
    description: "블랙 베벨 + 골드 라인",
    index: 2,
    sceneBackground: 0x080808,
    swatchClass: "from-zinc-900 via-amber-600/40 to-zinc-800",
  },
  {
    id: "sage_garden",
    label: "세이지 가든",
    description: "내추럴 웨딩 · 세이지 그린",
    index: 3,
    sceneBackground: 0x121a14,
    swatchClass: "from-emerald-200/70 via-lime-100/60 to-emerald-400/50",
  },
  {
    id: "royal_navy",
    label: "로열 네이비",
    description: "네이비 + 골드 포멀",
    index: 4,
    sceneBackground: 0x0f1420,
    swatchClass: "from-blue-950 via-amber-300/50 to-blue-900",
  },
];

export const DEFAULT_CUBE_FRAME_PRESET_ID: CubeFramePresetId = "rose_gold";

export function getCubeFramePreset(id: CubeFramePresetId): CubeFramePresetDefinition {
  return (
    CUBE_FRAME_PRESETS.find((preset) => preset.id === id) ?? CUBE_FRAME_PRESETS[0]
  );
}

export function framePresetIndex(id: CubeFramePresetId): number {
  return getCubeFramePreset(id).index;
}
