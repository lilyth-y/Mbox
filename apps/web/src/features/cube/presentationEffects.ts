/** Product templates (5). Do not remove — see experiments/assets/deliverables-spec.json */
export type PresentationEffectId =
  | "cube_focus"
  | "book_spread"
  | "turntable"
  | "orbit_gallery"
  | "album_flip";

export interface PresentationEffectDefinition {
  id: PresentationEffectId;
  label: string;
  description: string;
}

export const PRESENTATION_EFFECTS: PresentationEffectDefinition[] = [
  {
    id: "cube_focus",
    label: "1. 정육면체",
    description:
      "배경 제거(누끼)된 컷만 인물·배경이 앞뒤로 분리됩니다. 미처리 사진은 평면으로 표시됩니다.",
  },
  {
    id: "book_spread",
    label: "2. 책 펼침",
    description: "책장이 열리듯 펼쳐집니다. 누끼 컷은 장면마다 인물·배경 분리가 적용됩니다.",
  },
  {
    id: "turntable",
    label: "3. 원판 회전",
    description: "원판 위 사진이 돌아 전면에 멈춥니다. 누끼 컷만 분리 연출이 켜집니다.",
  },
  {
    id: "orbit_gallery",
    label: "4. 궤도 갤러리",
    description: "궤도를 따라 장면이 이어집니다. 누끼 컷만 인물·배경 분리됩니다.",
  },
  {
    id: "album_flip",
    label: "5. 앨범 넘김",
    description: "앨범을 넘기듯 다음 장면으로 이어집니다. 누끼 컷만 분리 연출됩니다.",
  },
];

export const DEFAULT_PRESENTATION_EFFECT: PresentationEffectId = "cube_focus";
