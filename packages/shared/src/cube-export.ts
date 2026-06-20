/** Photo border style on cube faces (5 presets). */
export type CubeFramePresetId =
  | "rose_gold"
  | "pearl_white"
  | "classic_black"
  | "sage_garden"
  | "royal_navy";

export const CUBE_FRAME_PRESET_IDS = [
  "rose_gold",
  "pearl_white",
  "classic_black",
  "sage_garden",
  "royal_navy",
] as const satisfies readonly CubeFramePresetId[];

export {
  CUBE_FRAME_FINISH_IDS,
  CUBE_FRAME_FINISH_OPTIONS,
  DEFAULT_CUBE_FRAME_FINISH_ID,
  type CubeFrameFinishId,
  type CubeFrameFinishOption,
} from "./cubeFrameFinish.js";

/** Built-in BGM catalog paths under `/bgm/` (see apps/web/public/bgm/README.md). */
export type CubeBgmTrackId =
  | "cinematic_romantic"
  | "piano_slideshow"
  | "romantic_wedding"
  | "bridal_chorus"
  | "workspace"
  | "none"
  | "custom";

export type ResolutionEnhanceScale = 1 | 2;

export {
  DEFAULT_CUBE_PRESENTATION_OPTIONS,
  DEFAULT_CUBE_SHOWCASE_FX,
  resolveCubeShowcaseFx,
  type CubeBackgroundPlateTheme,
  type CubePresentationOptionDefaults,
  type CubeShowcaseFxOptions,
} from "./cubePresentationDefaults.js";

export {
  CUBE_SUBJECT_PULL_PEAK,
  CUBE_SHOWCASE_FX_INTENSITY_MAX,
  CUBE_SHOWCASE_FX_INTENSITY_MIN,
  CUBE_ZOOM_INTENSITY_MAX,
  CUBE_ZOOM_INTENSITY_MIN,
  clampShowcaseFxIntensity,
  clampZoomIntensity,
  showcaseHeartbeatStrength,
  showcaseSubjectPullStrength,
  usesClassicFanMotion,
  usesBaseInPlaceFanMotion,
} from "./cubeShowcaseFx.js";

export {
  CUBE_EFFECT_QUALITY_WEIGHT,
  CUBE_EFFECT_SAFETY_WEIGHT,
  CUBE_DEPTH_BLUR_PX_MAX,
  CUBE_FACE_BG_Z,
  CUBE_FACE_CONTENT_SCALE,
  CUBE_FACE_PHOTO_Z,
  CUBE_FACE_PLANE_SIZE_REF,
  CUBE_ANGULAR_SPEED_MAX_RAD,
  CUBE_FACE_UV_INSET,
  CUBE_SIZE_SCALE_MIN,
  CUBE_SIZE_SCALE_MAX,
  DEFAULT_CUBE_SIZE_SCALE,
  DEFAULT_FAN_SPEED,
  clampCubeSizeScale,
  CUBE_INERTIA_HOLD_DAMPING,
  CUBE_INERTIA_HOLD_STIFFNESS,
  CUBE_INERTIA_ROTATION_DAMPING,
  CUBE_INERTIA_ROTATION_STIFFNESS,
  CUBE_INERTIA_SCALE_DAMPING,
  CUBE_INERTIA_SCALE_STIFFNESS,
  CUBE_FOCUS_PULSE_Z_MAX,
  CUBE_ORIGINAL_PLATE_BLUR_PX,
  CUBE_PARALLAX_BG_MUL_MAX,
  CUBE_PARALLAX_BG_MUL_VOLUMAX,
  CUBE_PARALLAX_FG_MUL_MAX,
  CUBE_PARALLAX_FG_MUL_VOLUMAX,
  CUBE_PARALLAX_PEAK_MAX,
  CUBE_PARALLAX_UV_WARP_MAX,
  CUBE_VOLUMAX_ALPHA_TEST,
  CUBE_VOLUMAX_MOUNT_MODE,
  PARALLAX_ALLOWED_FAN_PHASES,
  clampParallaxAmount,
  clampParallaxMul,
  isParallaxAllowedForFanPhase,
  isTransparentMatteDataUrl,
  isDistinctVoluMaxBackgroundPlate,
  isVoluMaxCutoutReady,
  isVoluMaxLayerReady,
  resolveSubjectForegroundUrl,
  resolveCubeFaceDisplayUrl,
  resolvePresentationBackgroundPlateUrl,
  resolveVoluMaxForegroundKind,
  type VoluMaxForegroundKind,
  maxAllowedParallaxOffsetWorld,
  maxVoluMaxParallaxOffsetWorld,
  maxVoluMaxUvWarpDelta,
  showcaseHoldParallaxEnvelope,
  type CubeVoluMaxMountMode,
  type ParallaxAllowedFanPhase,
} from "./cubeEffectFramework.js";

export {
  DEFAULT_FAN_BLADE_BACKDROP_COLOR_ID,
  DEFAULT_FAN_BLADE_FRAME_ID,
  FAN_BLADE_BACKDROP_PALETTE,
  FAN_BLADE_FRAME_IDS,
  FAN_BLADE_FRAME_PRESETS,
  getFanBladeFramePreset,
  resolveFanBladeBackdropHex,
  type FanBladeBackdropColor,
  type FanBladeFrameId,
  type FanBladeFramePreset,
} from "./fanBladeFrame.js";
export {
  getFanBladeOrnamentMarkup,
  renderFanBladeOrnamentSvg,
} from "./fanBladeOrnamentSvg.js";
export {
  DEFAULT_ORNAMENT_IMAGE_MODEL,
  FAN_BLADE_ORNAMENT_ASSET_DIR,
  FAN_BLADE_ORNAMENT_GENERATION_PROMPTS,
  FAN_BLADE_ORNAMENT_KINDS,
  fanBladeOrnamentAssetUrl,
} from "./fanBladeOrnamentAssets.js";
export {
  DEFAULT_PRESENTATION_MICRO_MODULE_STATE,
  PRESENTATION_MICRO_MODULES,
  isMicroModuleEnabled,
  microModuleStateKey,
  readMicroModuleEnabled,
  resolvePresentationEffectWithMicroModules,
  writeMicroModuleEnabled,
  type OrbitalShapeId,
  type PresentationMicroModuleDefinition,
  type PresentationMicroModuleId,
  type PresentationMicroModuleState,
} from "./presentationMicroModules.js";
export {
  CROSS_CUTTING_QUALITY_UPGRADES,
  ORBITAL_SHAPE_OPTIONS,
  PRESENTATION_MICRO_MODULE_SPECS,
  listAllQualityUpgrades,
  listQualityUpgradesForModule,
  type MicroModuleEffort,
  type MicroModuleQualityPriority,
  type MicroModuleQualityUpgrade,
  type PresentationMicroModuleSpec,
} from "./presentationMicroModuleRegistry.js";
export {
  ORBITAL_ACCEL_MS,
  ORBITAL_DECEL_MS,
  ORBITAL_JERK_BLEND_MS,
  ORBITAL_SHOWCASE_HOLD_MS,
  ORBITAL_TRAVEL_MS,
  getOrbitalShowcaseSegmentMs,
  interpolateOrbitalKeyframes,
  isOrbitalShowcaseFrozen,
  measureOrbitalAngularSpeedJerkPeak,
  measureOrbitalScaleJerkPeak,
  minimumJerkStep,
  resolveOrbitalShowcasePhase,
  sampleOrbitalShowcaseMotion,
  smootherstep,
  type OrbitalMotionKeyframe,
  type OrbitalShowcasePhase,
  type OrbitalShowcaseSample,
} from "./orbitalShowcaseMotion.js";
export {
  ORBITAL_ICOSAHEDRON_FACE_COUNT,
  ORBITAL_ICOSAHEDRON_FACES,
  ORBITAL_OCTAHEDRON_FACES,
  getOrbitalFaceCount,
  getOrbitalFaceLayouts,
  type OrbitalFaceLayout,
} from "./orbitalPolyhedronLayout.js";
export {
  CUBE_FRAME_TO_FAN_BLADE_FRAME,
  cubeFramePresetToFanBladeFrameId,
  sampleCubeFaceBorderPoint,
  sampleCubeFaceBorderRotation,
} from "./cubeFrameGarland.js";
export {
  DEFAULT_FRAME_AESTHETIC_THRESHOLDS,
  FRAME_PRESET_ACCENT_RGB,
  HOLOGRAM_FRAME_UV,
  listFramePresetIds,
  measureFrameAesthetic,
  passesFrameAestheticGate,
  synthesizeBrokenFrameBuffer,
  synthesizeReferenceFrameBuffer,
  type FrameAestheticSample,
  type FrameAestheticThresholds,
  type FramePixelBuffer,
} from "./cubeFrameAestheticMetrics.js";
export {
  FAN_BLADE_RING_STYLES,
  createFanBladeOrnamentCanvas,
  drawFanBladeOrnament,
  getFanBladeRingStyle,
  hasOrnamentAsset,
  preloadFanBladeOrnamentAssets,
  type FanBladeOrnamentKind,
  type FanBladeRingStyle,
} from "./fanBladeOrnamentArt.js";
