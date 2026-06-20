import type { CubeBackgroundPlateTheme } from "./cubePresentationDefaults.js";
import type { CubeBgmTrackId } from "./cube-export.js";

/** Visual busy-ness scale: 0 = minimal, 10 = very heavy. */
export const KPI_MEDIA_BUSY_WARN_THRESHOLD = 6;
export const KPI_MEDIA_BUSY_MAX_RESTRAINT_PRESET = 4;
export const KPI_MEDIA_PRESET_COUNT_MIN = 4;

/** Full-viewport backdrop opacity range (dimmed plane below 1.0). */
export const VIEWPORT_BACKDROP_OPACITY_MIN = 0.35;
export const VIEWPORT_BACKDROP_OPACITY_MAX = 1;
export const VIEWPORT_BACKDROP_OPACITY_DEFAULT = 1;

export type MediaComboPresetId =
  | "photo_focus"
  | "classic_wedding"
  | "ambient_video"
  | "romantic_garden"
  | "soft_blur";

export interface MediaPresentationState {
  viewportBackdropPath: string | null;
  /** 0.35–1.0; lower = dimmer full-screen backdrop */
  viewportBackdropOpacity?: number;
  backgroundPlateTheme: CubeBackgroundPlateTheme;
  particleTheme: string;
  bgmEnabled: boolean;
  bgmTrackId: CubeBgmTrackId | string;
}

export interface MediaComboPresetPatch {
  viewportBackdropPath?: string | null;
  backgroundPlateTheme?: CubeBackgroundPlateTheme;
  particleTheme?: string;
  bgmEnabled?: boolean;
  bgmTrackId?: CubeBgmTrackId | string;
  bgmWorkspacePath?: string | null;
  bgmCustomUrl?: string | null;
}

export interface MediaComboPreset {
  id: MediaComboPresetId;
  label: string;
  description: string;
  /** Lower = more restrained (KPI target for "절제" presets). */
  restraintScore: number;
  patch: MediaComboPresetPatch;
  followUpTip?: string;
}

export type MediaOverlapHintLevel = "info" | "tip" | "warn";

export interface MediaOverlapHint {
  id: string;
  level: MediaOverlapHintLevel;
  message: string;
}

const SYNTHETIC_FACE_THEMES: ReadonlySet<CubeBackgroundPlateTheme> = new Set([
  "classic_hall",
  "romantic_garden",
  "starry_night",
]);

const BUSY_PARTICLES: ReadonlySet<string> = new Set(["confetti", "floating_hearts"]);
const LIGHT_PARTICLES: ReadonlySet<string> = new Set(["gold_dust", "white_petals"]);

function isVideoBackdrop(path: string | null): boolean {
  if (!path) return false;
  const lower = path.toLowerCase();
  return lower.endsWith(".mp4") || lower.endsWith(".webm") || lower.endsWith(".mov");
}

function hasViewportBackdrop(path: string | null): boolean {
  return Boolean(path && path.trim().length > 0);
}

/** Quantitative visual load for KPI regression tests. */
export function computeMediaBusyScore(state: MediaPresentationState): number {
  let score = 0;
  if (hasViewportBackdrop(state.viewportBackdropPath)) {
    const opacity = state.viewportBackdropOpacity ?? VIEWPORT_BACKDROP_OPACITY_DEFAULT;
    const dimFactor = opacity < 0.65 ? 2 : opacity < 0.85 ? 1 : 0;
    score += (isVideoBackdrop(state.viewportBackdropPath) ? 4 : 3) - dimFactor;
  }
  if (state.backgroundPlateTheme === "original") {
    score += hasViewportBackdrop(state.viewportBackdropPath) ? 1 : 0;
  } else if (state.backgroundPlateTheme === "original_blurred") {
    score += 1;
  } else if (SYNTHETIC_FACE_THEMES.has(state.backgroundPlateTheme)) {
    score += 2;
  }
  if (BUSY_PARTICLES.has(state.particleTheme)) {
    score += 3;
  } else if (LIGHT_PARTICLES.has(state.particleTheme)) {
    score += 2;
  }
  return score;
}

export function computeMediaOverlapHints(state: MediaPresentationState): MediaOverlapHint[] {
  const hints: MediaOverlapHint[] = [];
  const hasBackdrop = hasViewportBackdrop(state.viewportBackdropPath);
  const videoBackdrop = isVideoBackdrop(state.viewportBackdropPath);
  const syntheticFace = SYNTHETIC_FACE_THEMES.has(state.backgroundPlateTheme);
  const busyParticle = BUSY_PARTICLES.has(state.particleTheme);
  const anyParticle = state.particleTheme !== "none";

  if (!hasBackdrop && state.backgroundPlateTheme === "original" && !anyParticle) {
    hints.push({
      id: "restrained-default",
      level: "info",
      message: "사진·큐브 중심 조합입니다. 배경이 과하지 않습니다.",
    });
    return hints;
  }

  if (hasBackdrop && syntheticFace) {
    hints.push({
      id: "backdrop-plus-synthetic-theme",
      level: "warn",
      message:
        "화면 전체 배경과 면 합성 테마가 동시에 켜져 있습니다. 한쪽만 강하게 쓰거나 면 테마를 「블러 배경」으로 바꿔 보세요.",
    });
  } else if (hasBackdrop && state.backgroundPlateTheme === "original") {
    hints.push({
      id: "backdrop-plus-original-plate",
      level: "tip",
      message:
        "전체 배경 뒤에 면 원본 배경도 보입니다. 과하면 전체 배경을 「없음」으로 두거나 면을 「블러 배경」으로 바꿔 보세요.",
    });
  }

  if (videoBackdrop && anyParticle) {
    hints.push({
      id: "video-plus-particles",
      level: busyParticle ? "warn" : "tip",
      message: busyParticle
        ? "동영상 배경 + 화려한 파티클은 화면이 복잡해질 수 있습니다. 파티클을 끄거나 금가루 정도만 권장합니다."
        : "동영상 배경에 파티클이 겹칩니다. 가볍게만 쓰면 괜찮습니다.",
    });
  }

  if (state.backgroundPlateTheme === "starry_night" && hasBackdrop) {
    hints.push({
      id: "starry-plus-backdrop",
      level: "tip",
      message: "은하수 면 테마와 전체 배경이 겹칩니다. 전체 배경을 끄면 면 연출이 더 선명합니다.",
    });
  }

  const score = computeMediaBusyScore(state);
  if (score >= KPI_MEDIA_BUSY_WARN_THRESHOLD && hints.every((h) => h.level !== "warn")) {
    hints.push({
      id: "busy-score-high",
      level: "warn",
      message: `시각 요소가 많습니다 (부하 지수 ${score}/10). 추천 조합의 「사진 중심」을 참고해 보세요.`,
    });
  } else if (score <= KPI_MEDIA_BUSY_MAX_RESTRAINT_PRESET && hints.length === 0) {
    hints.push({
      id: "restrained-ok",
      level: "info",
      message: "배경·파티클 균형이 안정적입니다.",
    });
  }

  return hints;
}

export const MEDIA_COMBO_PRESETS: readonly MediaComboPreset[] = [
  {
    id: "photo_focus",
    label: "사진 중심",
    description: "전체 배경 없음 · 원본 면 · 파티클 없음",
    restraintScore: 0,
    patch: {
      viewportBackdropPath: null,
      backgroundPlateTheme: "original",
      particleTheme: "none",
      bgmEnabled: true,
      bgmTrackId: "piano_slideshow",
      bgmWorkspacePath: null,
      bgmCustomUrl: null,
    },
  },
  {
    id: "soft_blur",
    label: "부드러운 블러",
    description: "인물 강조 · 면 배경만 블러",
    restraintScore: 1,
    patch: {
      viewportBackdropPath: null,
      backgroundPlateTheme: "original_blurred",
      particleTheme: "none",
      bgmEnabled: true,
      bgmTrackId: "piano_slideshow",
      bgmWorkspacePath: null,
      bgmCustomUrl: null,
    },
  },
  {
    id: "classic_wedding",
    label: "클래식 웨딩",
    description: "웨딩홀 면 테마 · 은은한 꽃잎",
    restraintScore: 4,
    patch: {
      viewportBackdropPath: null,
      backgroundPlateTheme: "classic_hall",
      particleTheme: "white_petals",
      bgmEnabled: true,
      bgmTrackId: "romantic_wedding",
      bgmWorkspacePath: null,
      bgmCustomUrl: null,
    },
  },
  {
    id: "ambient_video",
    label: "분위기 영상",
    description: "전체 MP4 + 면 블러 (영상은 내 파일에서 선택)",
    restraintScore: 5,
    patch: {
      backgroundPlateTheme: "original_blurred",
      particleTheme: "none",
      bgmEnabled: true,
      bgmTrackId: "piano_slideshow",
      bgmWorkspacePath: null,
      bgmCustomUrl: null,
    },
    followUpTip: "「화면 전체 배경 → 내 파일」에서 MP4를 고른 뒤 미리보기로 확인하세요.",
  },
  {
    id: "romantic_garden",
    label: "로맨틱 가든",
    description: "가든 면 테마 · 금가루 · 웨딩 BGM",
    restraintScore: 4,
    patch: {
      viewportBackdropPath: null,
      backgroundPlateTheme: "romantic_garden",
      particleTheme: "gold_dust",
      bgmEnabled: true,
      bgmTrackId: "bridal_chorus",
      bgmWorkspacePath: null,
      bgmCustomUrl: null,
    },
  },
] as const;

export function findMediaComboPreset(id: MediaComboPresetId): MediaComboPreset | undefined {
  return MEDIA_COMBO_PRESETS.find((preset) => preset.id === id);
}

export function applyPresetToPresentationState(
  state: MediaPresentationState,
  patch: MediaComboPresetPatch
): MediaPresentationState {
  return {
    viewportBackdropPath:
      patch.viewportBackdropPath !== undefined ? patch.viewportBackdropPath : state.viewportBackdropPath,
    backgroundPlateTheme: patch.backgroundPlateTheme ?? state.backgroundPlateTheme,
    particleTheme: patch.particleTheme ?? state.particleTheme,
    bgmEnabled: patch.bgmEnabled ?? state.bgmEnabled,
    bgmTrackId: patch.bgmTrackId ?? state.bgmTrackId,
  };
}
