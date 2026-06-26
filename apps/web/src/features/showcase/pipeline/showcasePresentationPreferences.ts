/** Deterministic 4-way spin — one direction per showcase loop (not random, not per-photo). */
export type PresentationSpinDirection = "left" | "right" | "up" | "down";

/** `cardinal`: one primary axis per loop. `compound`: simultaneous X/Y/Z tumble. */
export type VariableSpinMode = "cardinal" | "compound";

export const VARIABLE_SPIN_MODE_LABEL_KO: Record<VariableSpinMode, string> = {
  cardinal: "4방",
  compound: "복합",
};

export const PRESENTATION_FOUR_WAY_SPIN: readonly PresentationSpinDirection[] = [
  "left",
  "right",
  "up",
  "down",
];

export const PRESENTATION_SPIN_DIRECTION_LABEL_KO: Record<PresentationSpinDirection, string> =
  {
    left: "좌",
    right: "우",
    up: "상",
    down: "하",
  };

export interface ShowcasePresentationPreferences {
  /** 좌→우→상→하 cycle per loop — when off, always spin left (Y+). */
  variableSpinEnabled: boolean;
  /** When variable spin is on: single-axis loop vs simultaneous multi-axis tumble. */
  variableSpinMode: VariableSpinMode;
  zoomBreathingEnabled: boolean;
  /** Full in/out cycle length (ms). */
  zoomBreathingPeriodMs: number;
  /** Framing fill delta (higher = closer). Typical 0.06–0.12. */
  zoomBreathingAmplitude: number;
}

export const SHOWCASE_ZOOM_BREATHING_PERIOD_MIN_MS = 5_500;
export const SHOWCASE_ZOOM_BREATHING_PERIOD_MAX_MS = 16_000;
export const SHOWCASE_ZOOM_BREATHING_AMPLITUDE_MIN = 0.035;
export const SHOWCASE_ZOOM_BREATHING_AMPLITUDE_MAX = 0.14;

export const DEFAULT_SHOWCASE_PRESENTATION_PREFERENCES: ShowcasePresentationPreferences =
  {
    variableSpinEnabled: true,
    variableSpinMode: "compound",
    zoomBreathingEnabled: true,
    zoomBreathingPeriodMs: 9_200,
    zoomBreathingAmplitude: 0.085,
  };

export function clampZoomBreathingPeriodMs(value: number): number {
  return Math.max(
    SHOWCASE_ZOOM_BREATHING_PERIOD_MIN_MS,
    Math.min(SHOWCASE_ZOOM_BREATHING_PERIOD_MAX_MS, value)
  );
}

export function clampZoomBreathingAmplitude(value: number): number {
  return Math.max(
    SHOWCASE_ZOOM_BREATHING_AMPLITUDE_MIN,
    Math.min(SHOWCASE_ZOOM_BREATHING_AMPLITUDE_MAX, value)
  );
}

export function normalizeVariableSpinMode(mode?: VariableSpinMode): VariableSpinMode {
  return mode === "cardinal" ? "cardinal" : "compound";
}

export function getVariableSpinUiLabel(prefs: ShowcasePresentationPreferences): string {
  if (!prefs.variableSpinEnabled) {
    return "OFF";
  }
  return VARIABLE_SPIN_MODE_LABEL_KO[normalizeVariableSpinMode(prefs.variableSpinMode)];
}

/** OFF → 복합 → 4방 → OFF */
export function cycleVariableSpinPreference(
  prefs: ShowcasePresentationPreferences
): ShowcasePresentationPreferences {
  if (!prefs.variableSpinEnabled) {
    return {
      ...prefs,
      variableSpinEnabled: true,
      variableSpinMode: "compound",
    };
  }
  if (normalizeVariableSpinMode(prefs.variableSpinMode) === "compound") {
    return { ...prefs, variableSpinMode: "cardinal" };
  }
  return {
    ...prefs,
    variableSpinEnabled: false,
    variableSpinMode: "compound",
  };
}

/** Loop index → 좌·우·상·하 (deterministic, repeats every 4 cycles). */
export function resolvePresentationSpinDirection(
  presentationCycle: number,
  prefs: ShowcasePresentationPreferences
): PresentationSpinDirection {
  if (!prefs.variableSpinEnabled) {
    return "left";
  }
  const index = ((presentationCycle % 4) + 4) % 4;
  return PRESENTATION_FOUR_WAY_SPIN[index] ?? "left";
}

export function presentationSpinDirectionToSign(
  direction: PresentationSpinDirection
): 1 | -1 {
  return direction === "right" || direction === "down" ? -1 : 1;
}
