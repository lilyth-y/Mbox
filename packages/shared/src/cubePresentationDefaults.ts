import type { CubeFrameFinishId, CubeFramePresetId } from "./cube-export.js";
import { DEFAULT_CUBE_FRAME_FINISH_ID } from "./cubeFrameFinish.js";
import { DEFAULT_CUBE_SIZE_SCALE, DEFAULT_FAN_SPEED } from "./cubeEffectFramework.js";
import {
  DEFAULT_CUBE_SHOWCASE_FX,
  type CubeShowcaseFxOptions,
} from "./cubeShowcaseFx.js";

/** Background plate themes shared by main cube UI and wedding-simple. */
export type CubeBackgroundPlateTheme =
  | "original"
  | "original_blurred"
  | "classic_hall"
  | "romantic_garden"
  | "starry_night";

/**
 * Single source of truth for cube / wedding-simple presentation defaults.
 * All effects are opt-in (OFF) unless the user enables them in the UI.
 *
 * Safety 7 : Quality 3 — see `cubeEffectFramework.ts` for allowed phases and hard caps.
 * Do not default-enable effects here to chase visuals.
 */
export interface CubePresentationOptionDefaults {
  framePresetId: CubeFramePresetId;
  /** Glossy lacquer vs wood stain — both tint from photo core color. */
  frameFinishId: CubeFrameFinishId;
  /** Legacy shader flag; product preview always uses rectangular viewport (false). */
  hologramMode: boolean;
  particleTheme: string;
  voluMaxDepthEnabled: boolean;
  voluMaxFxEnabled: boolean;
  voluMaxAutoPrepareLayers: boolean;
  voluMaxAiForegroundCutout: boolean;
  backgroundPlateTheme: CubeBackgroundPlateTheme;
  bgmEnabled: boolean;
  cubeRotationMode: string;
  /** Angular-velocity integration for cube_focus root motion (opt-in). */
  cubeAngularInertiaEnabled: boolean;
  /** Mesh size multiplier in 3D preview (independent of fan zoom timeline). */
  cubeSizeScale: number;
  /** Lub-dub pulse during face showcase (cube_focus). */
  cubeHeartbeatEnabled: boolean;
  /** Camera + scale dolly on approach / retreat (cube_focus). */
  cubeShowcaseZoomEnabled: boolean;
  /** Pitch / roll tumble layered on yaw (cube_focus). */
  cubeComplexRotationEnabled: boolean;
  /** VoluMax fg-only pull toward camera; bg plate fixed (cube_focus). */
  cubeSubjectPullEnabled: boolean;
  /** Yaw tempo follows zoom scale — fast when small, slow at hero peak (cube_focus). */
  cubeScaleCoupledSpinEnabled: boolean;
  cubeZoomIntensity: number;
  cubeComplexRotationIntensity: number;
  cubeAcceleratedSpinIntensity: number;
  cubeSubjectPullIntensity: number;
  cubeHeartbeatIntensity: number;
  /** Fan / cube spin tempo (0.35–2.5×). Higher = faster approach, retreat, and loop bridge. */
  fanSpeed: number;
}

export type { CubeShowcaseFxOptions };
export { DEFAULT_CUBE_SHOWCASE_FX, resolveCubeShowcaseFx } from "./cubeShowcaseFx.js";

export const DEFAULT_CUBE_PRESENTATION_OPTIONS: CubePresentationOptionDefaults = {
  framePresetId: "rose_gold",
  frameFinishId: DEFAULT_CUBE_FRAME_FINISH_ID,
  hologramMode: false,
  particleTheme: "none",
  voluMaxDepthEnabled: false,
  voluMaxFxEnabled: false,
  voluMaxAutoPrepareLayers: false,
  /** VoluMax needs true AI silhouette; soft matte alone cannot separate in-scene background. */
  voluMaxAiForegroundCutout: true,
  backgroundPlateTheme: "original",
  bgmEnabled: false,
  cubeRotationMode: "auto",
  cubeAngularInertiaEnabled: false,
  cubeSizeScale: DEFAULT_CUBE_SIZE_SCALE,
  fanSpeed: DEFAULT_FAN_SPEED,
  ...DEFAULT_CUBE_SHOWCASE_FX,
};
