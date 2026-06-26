import { HOLOGRAM_DISPLAY_SPEC, type ShowcaseStageMaturity } from "@mbox/shared";
import type { HoloContentTextures } from "../babylon/holoContentTextures";
import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture";
import type { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import type { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import type { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { JewelCubePhysicsRig } from "../babylon/jewelCubeFactory";
import type { ShowcaseCatalogOptions } from "../showcaseCatalogOptions";
import type {
  PresentationSpinDirection,
  ShowcasePresentationPreferences,
} from "./showcasePresentationPreferences";
import {
  JEWEL_CUBE_HALF_EXTENT,
} from "./pipelineOrder";

/** Ordered showcase process stages (rotation-only). */
export type ShowcasePipelineStageId = "reveal" | "rotate" | "pull" | "ascend";

export const SHOWCASE_PIPELINE_STAGE_ORDER: ShowcasePipelineStageId[] = [
  "reveal",
  "rotate",
  "pull",
  "ascend",
];

/** Default pipeline — rotation showcase (no Havok fall). */
export const ACTIVE_SHOWCASE_PIPELINE: ShowcasePipelineStageId[] = [
  "reveal",
  "rotate",
  "pull",
  "ascend",
];

export interface ShowcasePipelineConfig {
  showcaseCenter: Vector3;
  /** Cube center Y when resting on floor (ground y=0). */
  jewelRestCenterY: number;
  revealHoldMs: number;
  rotateDurationMs: number;
  rotateSpeedY: number;
  showcaseCameraRadius: number;
  morphDurationMs: number;
  /** Front-on camera orbit angle (radians). */
  showcaseCameraAlpha: number;
  showcaseCameraBeta: number;
  floatAmplitudeY: number;
  floatPeriodMs: number;
  floatSwayX: number;
  floatSwayZ: number;
  floatHoldStiffness: number;
  /** Y spin while photos crossfade. */
  morphRotateSpeedY: number;
  /** Framing fill when cube floats (lower = zoom out). */
  cameraFloatFramingFill: number;
  /** Framing fill during fall (higher = zoom in). */
  cameraFallFramingFill: number;
  /** Subtle zoom in/out cycle while floating (fill delta). */
  cameraPresentationZoomPeriodMs: number;
  cameraPresentationZoomAmplitude: number;
  /** Fixed world Y rotation for presentation (radians). */
  presentationYawRadians: number;
  cameraFramingFill: number;
  cameraBounceFramingFill: number;
  cameraTargetSmoothMs: number;
  cameraFallSmoothMs: number;
  /** Beta (rad) when cube is on/near the floor — closer to π/2 = more horizontal. */
  cameraFallBetaGround: number;
  cameraBounceBetaGround: number;
  /** Extra Y spin after morph before the front pull. */
  pullSpinLeadMs: number;
  /** When zoom begins during spin lead (0–1 of lead). */
  pullZoomLeadOverlap: number;
  /** Camera + yaw snap duration. */
  pullDurationMs: number;
  /** Hold on front hero framing. */
  pullHoldMs: number;
  /** Return from hero back to floating framing (symmetric zoom-out). */
  pullReturnMs: number;
  /** Tight fill for hero close-up (higher = closer). */
  pullFramingFill: number;
  pullTargetSmoothMs: number;
  /** Dedicated hero orbit — camera faces cube portrait slot. */
  pullHeroCameraAlpha: number;
  pullHeroCameraBeta: number;
  /** Fine-tune which cube face reads as photo front (rad). */
  presentationFaceOffsetRadians: number;
  /** World Y of viewer eyes — aerial cube Y is derived from this + camera orbit. */
  viewerEyeHeightY: number;
  /** Floor clamp for aerial anchor (keeps jewel above booth). */
  minAerialCenterY: number;
  /** `fixed` = hold exact aerial slot; `gentle` = subtle bob for life. */
  aerialMotionMode: "fixed" | "gentle";
}

export const DEFAULT_SHOWCASE_PIPELINE_CONFIG: ShowcasePipelineConfig = {
  showcaseCenter: new Vector3(0, 1.48, 0),
  jewelRestCenterY: JEWEL_CUBE_HALF_EXTENT,
  revealHoldMs: 450,
  rotateDurationMs: 3_400,
  rotateSpeedY: 0.9,
  showcaseCameraRadius: 3.2,
  morphDurationMs: 2_200,
  showcaseCameraAlpha: -Math.PI / 2,
  showcaseCameraBeta: 1.46,
  floatAmplitudeY: 0.06,
  floatPeriodMs: 3_400,
  floatSwayX: 0.028,
  floatSwayZ: 0.022,
  floatHoldStiffness: 28,
  morphRotateSpeedY: 0.9,
  cameraFloatFramingFill: 0.64,
  cameraFallFramingFill: 0.9,
  cameraPresentationZoomPeriodMs: 5_200,
  cameraPresentationZoomAmplitude: 0.04,
  presentationYawRadians: 0,
  cameraFramingFill: 0.82,
  cameraBounceFramingFill: 0.72,
  cameraTargetSmoothMs: 200,
  cameraFallSmoothMs: 150,
  cameraFallBetaGround: 1.28,
  cameraBounceBetaGround: 1.32,
  pullSpinLeadMs: 1_200,
  pullZoomLeadOverlap: 0.55,
  pullDurationMs: 3_200,
  pullHoldMs: 1_000,
  pullReturnMs: 3_200,
  pullFramingFill: HOLOGRAM_DISPLAY_SPEC.pullPhotoViewportFill,
  pullTargetSmoothMs: 420,
  pullHeroCameraAlpha: -Math.PI / 2,
  pullHeroCameraBeta: 1.44,
  presentationFaceOffsetRadians: 0,
  viewerEyeHeightY: 1.58,
  minAerialCenterY: 1.05,
  aerialMotionMode: "fixed",
};

/** Shorter stage timings for cloud worker exports (same choreography, less wall time). */
export const CLOUD_SHOWCASE_PIPELINE_CONFIG: ShowcasePipelineConfig = {
  ...DEFAULT_SHOWCASE_PIPELINE_CONFIG,
  showcaseCenter: DEFAULT_SHOWCASE_PIPELINE_CONFIG.showcaseCenter.clone(),
  revealHoldMs: 300,
  rotateDurationMs: 2_200,
  morphDurationMs: 1_400,
  pullSpinLeadMs: 900,
  pullDurationMs: 2_200,
  pullHoldMs: 600,
  pullReturnMs: 2_200,
};

export type ShowcaseStageStatus = "continue" | "complete";

export interface ShowcaseSceneRuntime {
  getHoloContent: (sourceUrl: string) => HoloContentTextures;
  getPhotoTexture: (sourceUrl: string) => BaseTexture;
  applyShellReflection: (material: PBRMaterial) => void;
}

export interface ShowcaseStageContext {
  scene: Scene;
  camera: ArcRotateCamera;
  config: ShowcasePipelineConfig;
  catalog: ShowcaseCatalogOptions;
  runtime: ShowcaseSceneRuntime;
  rig: JewelCubePhysicsRig | null;
  imageUrls: string[];
  imageIndex: number;
  phaseElapsedMs: number;
  /** Monotonic clock for continuous float bob across stages. */
  totalElapsedMs: number;
  stageId: ShowcasePipelineStageId;
  spinSign: 1 | -1;
  spinDirection: PresentationSpinDirection;
  /** True while MP4 capture is running (deterministic physics). */
  exportRecording: boolean;
  /** Per-stage scratch (enter/tick/exit). */
  stageState: Record<string, unknown>;
  /** Signed Y angular velocity (rad/s) — continuous across presentation stages. */
  spinOmegaY: number;
  /** Completed ascend cycles — used to skip reveal on loop. */
  presentationCycle: number;
  presentationPrefs: ShowcasePresentationPreferences;
}

export interface ShowcasePipelineStage {
  id: ShowcasePipelineStageId;
  enter: (ctx: ShowcaseStageContext) => void;
  tick: (ctx: ShowcaseStageContext, dtMs: number) => ShowcaseStageStatus;
  exit?: (ctx: ShowcaseStageContext) => void;
}

export interface ShowcasePipelineSnapshot {
  stageId: ShowcasePipelineStageId;
  stageIndex: number;
  imageIndex: number;
  phaseElapsedMs: number;
  /** Active stage content version (semver). */
  stageVersion: string;
  /** Active stage content maturity. */
  stageMaturity: ShowcaseStageMaturity;
}
