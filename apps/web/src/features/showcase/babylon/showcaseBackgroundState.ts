import type { ShowcaseBackdropSample } from "./showcaseBackdropSampler";

export type ShowcaseBackgroundLightingState = {
  sample: ShowcaseBackdropSample | null;
  influence: number;
  mediaActive: boolean;
  glowMul: number;
};

let state: ShowcaseBackgroundLightingState = {
  sample: null,
  influence: 0.72,
  mediaActive: false,
  glowMul: 1,
};

export function getShowcaseBackgroundLightingState(): ShowcaseBackgroundLightingState {
  return state;
}

export function setShowcaseBackgroundLightingState(
  patch: Partial<ShowcaseBackgroundLightingState>
): void {
  state = { ...state, ...patch };
}

export function resetShowcaseBackgroundLightingState(): void {
  state = { sample: null, influence: 0.72, mediaActive: false, glowMul: 1 };
}
