/** Product templates (5). Do not remove — see experiments/assets/deliverables-spec.json */
export type BackgroundTemplateId =
  | "studio"
  | "nature"
  | "city"
  | "abstract"
  | "warm_interior";

export interface BackgroundTemplate {
  id: BackgroundTemplateId;
  label: string;
  description: string;
  prompt: string;
}

export const BACKGROUND_TEMPLATES: BackgroundTemplate[] = [
  {
    id: "studio",
    label: "스튜디오",
    description: "부드러운 그라데이션과 은은한 비네팅",
    prompt: "soft gradient studio backdrop with subtle vignette and professional portrait lighting",
  },
  {
    id: "nature",
    label: "자연",
    description: "숲, 산, 하늘이 어우러진 야외 배경",
    prompt: "lush outdoor nature scene with forest, mountains, and soft daylight",
  },
  {
    id: "city",
    label: "도시",
    description: "현대적인 야경과 보케 조명",
    prompt: "modern city skyline at dusk with cinematic bokeh lights",
  },
  {
    id: "abstract",
    label: "추상",
    description: "색감이 풍부한 추상 배경",
    prompt: "colorful abstract background with flowing shapes and depth",
  },
  {
    id: "warm_interior",
    label: "실내",
    description: "따뜻한 톤의 실내 공간",
    prompt: "warm cozy interior with natural window light and soft shadows",
  },
];

export function composeBackgroundPrompt(
  templateId: BackgroundTemplateId,
  customPrompt?: string
): string {
  const template = BACKGROUND_TEMPLATES.find((entry) => entry.id === templateId);
  const segments = [template?.prompt, customPrompt?.trim()].filter(
    (segment): segment is string => Boolean(segment)
  );
  return segments.join(", ");
}
