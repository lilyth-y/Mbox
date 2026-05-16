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
    description: "정육면체가 천천히 회전하며 정면에 맞춘 뒤 장면에 집중합니다.",
  },
  {
    id: "book_spread",
    label: "2. 책 펼침",
    description: "책장이 열리듯 펼쳐지며 한 장면씩 읽어 들입니다.",
  },
  {
    id: "turntable",
    label: "3. 원판 회전",
    description: "원판 위 사진이 천천히 돌아 전면에 멈춥니다.",
  },
  {
    id: "orbit_gallery",
    label: "4. 궤도 갤러리",
    description: "사진들이 넓은 궤도를 따라 천천히 돌며 전면에 머뭅니다.",
  },
  {
    id: "album_flip",
    label: "5. 앨범 넘김",
    description: "앨범 페이지가 넘어가듯 다음 장면으로 이어집니다.",
  },
];

export const DEFAULT_PRESENTATION_EFFECT: PresentationEffectId = "cube_focus";
