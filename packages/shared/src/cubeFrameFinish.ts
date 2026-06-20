/** Photo border surface finish on cube face shaders. */
export type CubeFrameFinishId = "glossy" | "wood" | "none";

export const CUBE_FRAME_FINISH_IDS = ["glossy", "wood", "none"] as const satisfies readonly CubeFrameFinishId[];

/** Borderless default — framed shell mount at outer radius caused hollow / tunnel preview. */
export const DEFAULT_CUBE_FRAME_FINISH_ID: CubeFrameFinishId = "none";

export interface CubeFrameFinishOption {
  id: CubeFrameFinishId;
  label: string;
  description: string;
}

export const CUBE_FRAME_FINISH_OPTIONS: CubeFrameFinishOption[] = [
  {
    id: "glossy",
    label: "광택",
    description: "사진 색·밝기를 반영한 라커 광택",
  },
  {
    id: "wood",
    label: "우드",
    description: "사진 색·채도를 스테인으로 반영한 목재",
  },
  {
    id: "none",
    label: "테두리 없음",
    description: "프레임·매트 없이 사진만 풀블리드",
  },
];
