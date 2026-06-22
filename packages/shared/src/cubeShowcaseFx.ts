/**
 * Opt-in cube_focus showcase effects (Safety 7 : Quality 3).
 * Layered steps — enable and tune each independently in the UI.
 */

export interface CubeShowcaseFxOptions {
  /** Lub-dub scale / camera pulse during showcase hold. */
  cubeHeartbeatEnabled: boolean;
  /** Fan timeline dolly + presentationScale pull-in / push-back. */
  cubeShowcaseZoomEnabled: boolean;
  /** Pitch / roll tumble on approach · retreat (independent of zoom dolly). */
  cubeComplexRotationEnabled: boolean;
  /** VoluMax foreground-only Z pull; background plate stays fixed. */
  cubeSubjectPullEnabled: boolean;
  /**
   * Yaw tempo follows presentation scale — fast when small, slow at hero peak.
   * Requires {@link cubeShowcaseZoomEnabled}.
   */
  cubeScaleCoupledSpinEnabled: boolean;
  /** 0.35–1.5 — dolly depth when zoom is on (1 = full timeline range). */
  cubeZoomIntensity: number;
  /** 0–1 — pitch/roll tumble strength when complex rotation is on. */
  cubeComplexRotationIntensity: number;
  /** 0–1 — scale-coupled yaw acceleration strength. */
  cubeAcceleratedSpinIntensity: number;
  /** 0–1 — VoluMax foreground pull toward camera. */
  cubeSubjectPullIntensity: number;
  /** 0–1 — lub-dub pulse strength. */
  cubeHeartbeatIntensity: number;
}

export const CUBE_ZOOM_INTENSITY_MIN = 0.35;
export const CUBE_ZOOM_INTENSITY_MAX = 1.5;
export const CUBE_SHOWCASE_FX_INTENSITY_MIN = 0;
export const CUBE_SHOWCASE_FX_INTENSITY_MAX = 1;

export const DEFAULT_CUBE_SHOWCASE_FX: CubeShowcaseFxOptions = {
  cubeHeartbeatEnabled: false,
  cubeShowcaseZoomEnabled: false,
  cubeComplexRotationEnabled: false,
  cubeSubjectPullEnabled: false,
  cubeScaleCoupledSpinEnabled: false,
  cubeZoomIntensity: 1,
  cubeComplexRotationIntensity: 1,
  cubeAcceleratedSpinIntensity: 1,
  cubeSubjectPullIntensity: 1,
  cubeHeartbeatIntensity: 1,
};

export function clampShowcaseFxIntensity(value: number): number {
  return Math.min(
    CUBE_SHOWCASE_FX_INTENSITY_MAX,
    Math.max(CUBE_SHOWCASE_FX_INTENSITY_MIN, value)
  );
}

export function clampZoomIntensity(value: number): number {
  return Math.min(CUBE_ZOOM_INTENSITY_MAX, Math.max(CUBE_ZOOM_INTENSITY_MIN, value));
}

export function resolveCubeShowcaseFx(
  partial?: Partial<CubeShowcaseFxOptions> | null
): CubeShowcaseFxOptions {
  return {
    cubeHeartbeatEnabled: partial?.cubeHeartbeatEnabled ?? false,
    cubeShowcaseZoomEnabled: partial?.cubeShowcaseZoomEnabled ?? false,
    cubeComplexRotationEnabled: partial?.cubeComplexRotationEnabled ?? false,
    cubeSubjectPullEnabled: partial?.cubeSubjectPullEnabled ?? false,
    cubeScaleCoupledSpinEnabled: partial?.cubeScaleCoupledSpinEnabled ?? false,
    cubeZoomIntensity: clampZoomIntensity(partial?.cubeZoomIntensity ?? 1),
    cubeComplexRotationIntensity: clampShowcaseFxIntensity(
      partial?.cubeComplexRotationIntensity ?? 1
    ),
    cubeAcceleratedSpinIntensity: clampShowcaseFxIntensity(
      partial?.cubeAcceleratedSpinIntensity ?? 1
    ),
    cubeSubjectPullIntensity: clampShowcaseFxIntensity(partial?.cubeSubjectPullIntensity ?? 1),
    cubeHeartbeatIntensity: clampShowcaseFxIntensity(partial?.cubeHeartbeatIntensity ?? 1),
  };
}

export function showcaseHeartbeatStrength(fx: CubeShowcaseFxOptions): number {
  return fx.cubeHeartbeatEnabled
    ? clampShowcaseFxIntensity(fx.cubeHeartbeatIntensity ?? 1)
    : 0;
}

export function showcaseSubjectPullStrength(fx: CubeShowcaseFxOptions): number {
  return fx.cubeSubjectPullEnabled ? fx.cubeSubjectPullIntensity : 0;
}

/** 제자리 기본 회전(1단계): 줌·스케일결합 스핀 없이 fanMotion 경로 사용. 복합 회전은 추가 레이어. */
export function usesBaseInPlaceFanMotion(fx: CubeShowcaseFxOptions): boolean {
  return !fx.cubeShowcaseZoomEnabled && !fx.cubeScaleCoupledSpinEnabled;
}

/** @deprecated Use {@link usesBaseInPlaceFanMotion}. */
export function usesClassicFanMotion(fx: CubeShowcaseFxOptions): boolean {
  return usesBaseInPlaceFanMotion(fx);
}

/** Peak shader / mesh Z for subject-only pull (fg mesh or uFocusPulse). */
export const CUBE_SUBJECT_PULL_PEAK = 0.94;
