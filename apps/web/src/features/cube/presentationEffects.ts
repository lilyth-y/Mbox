/** Product templates (5). Do not remove — see experiments/assets/deliverables-spec.json */

export type PresentationEffectId =

  | "cube_focus"

  | "orbital_showcase"

  | "book_spread"

  | "turntable"

  | "orbit_gallery"

  | "album_flip";



export interface PresentationEffectDefinition {

  id: PresentationEffectId;

  label: string;

  /** Short product-facing motion feel (shown in template picker). */

  moodLabel: string;

  description: string;

}



export const PRESENTATION_EFFECTS: PresentationEffectDefinition[] = [

  {

    id: "cube_focus",

    label: "1. 정육면체",

    moodLabel: "홀로그램 팬 · 입체 큐브",

    description:

      "멀리서 회전하며 다가온 뒤 사진별로 감상합니다. 누끼 컷은 인물·배경이 앞뒤로 분리됩니다.",

  },

  {

    id: "book_spread",

    label: "2. 책 펼침",

    moodLabel: "책장 펼침 · 레이어 전개",

    description: "책장이 열리듯 장면이 펼쳐집니다. 누끼 컷은 장면마다 인물·배경 분리가 적용됩니다.",

  },

  {

    id: "turntable",

    label: "3. 원판 회전",

    moodLabel: "회전목마 · 오르골",

    description:

      "원판 위 사진이 돌아 전면에 멈춥니다. 감상 구간에 은은한 오르골 흔들림이 더해집니다.",

  },

  {

    id: "orbit_gallery",

    label: "4. 궤도 갤러리",

    moodLabel: "궤도 회전 · 버블 갤러리",

    description:

      "궤도를 따라 장면이 이어집니다. 둥 떠 있는 갤러리 느낌과 오르골 흔들림이 함께 적용됩니다.",

  },

  {

    id: "album_flip",

    label: "5. 앨범 넘김",

    moodLabel: "앨범 플립 · 넘김",

    description: "앨범 페이지를 넘기듯 다음 장면으로 이어집니다. 누끼 컷만 분리 연출됩니다.",

  },

];



export const DEFAULT_PRESENTATION_EFFECT: PresentationEffectId = "cube_focus";


