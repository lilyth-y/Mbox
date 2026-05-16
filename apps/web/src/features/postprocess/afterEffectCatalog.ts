import type { PostProcessingSettings } from "../../shared/types";

export interface AfterEffectRecommendation {
  id: keyof PostProcessingSettings;
  label: string;
  description: string;
  adjustable: boolean;
}

export const DEFAULT_POST_PROCESSING: PostProcessingSettings = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  warmth: 0,
  shadowLift: 0,
  vignette: 0,
  sharpness: 0,
};

export const AFTER_EFFECT_RECOMMENDATIONS: AfterEffectRecommendation[] = [
  {
    id: "brightness",
    label: "명암",
    description: "중요한 순간의 분위기를 살리되, 피부 톤이 과하게 날아가지 않게 조절합니다.",
    adjustable: true,
  },
  {
    id: "contrast",
    label: "대비",
    description: "피사체와 배경의 분리감을 주어 시선이 자연스럽게 주인공으로 모입니다.",
    adjustable: true,
  },
  {
    id: "saturation",
    label: "색채·채도",
    description: "기억의 온도를 맞춥니다. 행사·여행 사진은 살짝만 올리는 편이 안전합니다.",
    adjustable: true,
  },
  {
    id: "warmth",
    label: "색온도",
    description: "따뜻한 실내·석양 장면에 어울리며, 차가운 톤은 도시·야경에 맞습니다.",
    adjustable: true,
  },
  {
    id: "shadowLift",
    label: "그림자",
    description: "얼굴·피사체 주변 그림자를 부드럽게 들어 올려 디테일을 살립니다.",
    adjustable: true,
  },
  {
    id: "vignette",
    label: "비네팅",
    description: "가장자리를 살짝 어둡게 해 중앙 장면에 몰입감을 줍니다.",
    adjustable: true,
  },
  {
    id: "sharpness",
    label: "선명도",
    description: "과하면 노이즈가 보이므로 약하게 쓰는 것을 권장합니다.",
    adjustable: true,
  },
];

export const AFTER_EFFECT_PRESETS: Array<{
  id: string;
  label: string;
  description: string;
  settings: PostProcessingSettings;
}> = [
  {
    id: "memorial_soft",
    label: "기념 소프트",
    description: "부드러운 명암과 약한 비네팅",
    settings: {
      ...DEFAULT_POST_PROCESSING,
      brightness: 4,
      contrast: -6,
      saturation: -4,
      vignette: 18,
      shadowLift: 10,
    },
  },
  {
    id: "event_vivid",
    label: "행사 생동감",
    description: "채도와 대비를 살짝 올린 연출",
    settings: {
      ...DEFAULT_POST_PROCESSING,
      contrast: 10,
      saturation: 12,
      sharpness: 8,
    },
  },
  {
    id: "sunset_warm",
    label: "따뜻한 석양",
    description: "색온도와 그림자 보정 중심",
    settings: {
      ...DEFAULT_POST_PROCESSING,
      warmth: 16,
      shadowLift: 8,
      brightness: 3,
    },
  },
];
