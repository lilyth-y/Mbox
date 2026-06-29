import { isCloudGpuSession, isGpuSafeMode, isLocalGpuSession, isLocalhostInteractivePreview } from "../../shared/lib/gpuSession";
import {
  isLocalGpuExportSession,
  isRenderWorkerExportSession,
} from "../../shared/lib/renderExportProfile";

/** Preview / export GPU budget — full quality vs 1024-capped simplified. */
export type ShowcaseGpuTier = "full" | "simplified";

/** Per-subsystem toggles — tune with URL (?noPhysics=1 &c.) or ?safe=1 bundle. */
export type ShowcaseSubsystemFlags = {
  physics: boolean;
  domBackdropVideo: boolean;
  chapelPanorama: boolean;
  /** Outer brilliant-cut shell — glossy crystal (default on). */
  crystalShell: boolean;
  /** One inner photo volume inside the shell — no fg/bg depth-split stacks. */
  singleInnerPhoto: boolean;
  /** A/B photo layers for smooth crossfade morph between images. */
  photoCrossfade: boolean;
  shellInnerLayer: boolean;
  depthSplitForeground: boolean;
  shellGlow: boolean;
};

export type ShowcaseGpuBudget = {
  tier: ShowcaseGpuTier;
  textureMaxEdge: number;
  cubeTextureSize: number;
  renderMaxSize: number;
  panoramaCanvasSize: number;
  envCubemapSize: number;
  photoDomeResolution: number;
  maxAnisotropy: number;
  hardwareScalingLevel: number;
  exportFps: number;
  subsystems: ShowcaseSubsystemFlags;
};

export const SHOWCASE_GPU_SIMPLIFIED_BUDGET: ShowcaseGpuBudget = {
  tier: "simplified",
  textureMaxEdge: 1536,
  cubeTextureSize: 1536,
  renderMaxSize: 2048,
  panoramaCanvasSize: 512,
  envCubemapSize: 128,
  photoDomeResolution: 16,
  maxAnisotropy: 2,
  hardwareScalingLevel: 3,
  exportFps: 30,
  subsystems: {
    physics: false,
    domBackdropVideo: false,
    chapelPanorama: false,
    crystalShell: true,
    singleInnerPhoto: true,
    photoCrossfade: true,
    shellInnerLayer: false,
    depthSplitForeground: false,
    shellGlow: false,
  },
};

export const SHOWCASE_GPU_FULL_BUDGET: ShowcaseGpuBudget = {
  tier: "full",
  textureMaxEdge: 2048,
  cubeTextureSize: 2048,
  renderMaxSize: 2560,
  panoramaCanvasSize: 2048,
  envCubemapSize: 512,
  photoDomeResolution: 64,
  maxAnisotropy: 16,
  hardwareScalingLevel: 1,
  exportFps: 60,
  subsystems: {
    physics: false,
    domBackdropVideo: true,
    chapelPanorama: true,
    crystalShell: true,
    singleInnerPhoto: true,
    photoCrossfade: true,
    shellInnerLayer: false,
    depthSplitForeground: false,
    shellGlow: true,
  },
};

/** RTX Chrome / localhost interactive preview — native DPR, full photo raster. */
export const SHOWCASE_LOCAL_GPU_INTERACTIVE_BUDGET: ShowcaseGpuBudget = {
  ...SHOWCASE_GPU_FULL_BUDGET,
  textureMaxEdge: 2048,
  cubeTextureSize: 2048,
  hardwareScalingLevel: 1,
  maxAnisotropy: 16,
};

/** Playwright + ANGLE local MP4 — hardware GPU, photo shaders, 2K–4K output; lighter VRAM than interactive full. */
export const SHOWCASE_LOCAL_GPU_EXPORT_BUDGET: ShowcaseGpuBudget = {
  tier: "full",
  textureMaxEdge: 1536,
  cubeTextureSize: 1536,
  renderMaxSize: 3840,
  panoramaCanvasSize: 512,
  envCubemapSize: 128,
  photoDomeResolution: 16,
  maxAnisotropy: 8,
  hardwareScalingLevel: 2,
  exportFps: 60,
  subsystems: {
    physics: false,
    domBackdropVideo: false,
    chapelPanorama: false,
    crystalShell: true,
    singleInnerPhoto: true,
    photoCrossfade: true,
    shellInnerLayer: false,
    depthSplitForeground: false,
    shellGlow: false,
  },
};

export type ShowcaseGpuProfileContext = {
  gpuSafeSession?: boolean;
  forceWebGl1?: boolean;
};

function readSearchFlag(name: string): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return new URLSearchParams(window.location.search).get(name) === "1";
}

export function usesJewelPhotoMorphTwin(
  flags: ShowcaseSubsystemFlags = resolveShowcaseSubsystemFlags()
): boolean {
  return flags.photoCrossfade !== false;
}

/** A/B twin stacks for crossfade — cube only; portrait heart uses single-layer dip fade. */
export function shouldSpawnJewelPhotoMorphTwin(
  flags: ShowcaseSubsystemFlags = resolveShowcaseSubsystemFlags(),
  photoLayout: "cube" | "portrait" = "portrait"
): boolean {
  return usesJewelPhotoMorphTwin(flags) && photoLayout === "cube";
}

/** Subsystem switches — explicit URL overrides beat tier defaults. */
export function resolveShowcaseSubsystemFlags(
  tier: ShowcaseGpuTier = resolveShowcaseGpuTier()
): ShowcaseSubsystemFlags {
  const base = isLocalGpuExportSession()
    ? { ...SHOWCASE_LOCAL_GPU_EXPORT_BUDGET.subsystems }
    : tier === "simplified"
      ? { ...SHOWCASE_GPU_SIMPLIFIED_BUDGET.subsystems }
      : { ...SHOWCASE_GPU_FULL_BUDGET.subsystems };

  const safe = readSearchFlag("safe");
  const kinematic = readSearchFlag("kinematic") || safe;

  base.physics = false;
  if (readSearchFlag("noVideo") || safe) {
    base.domBackdropVideo = false;
  }
  if (readSearchFlag("noPanorama") || kinematic) {
    base.chapelPanorama = false;
  }
  if (readSearchFlag("noCrystalShell")) {
    base.crystalShell = false;
  }
  if (!base.crystalShell) {
    base.shellInnerLayer = false;
    base.shellGlow = false;
  }
  if (readSearchFlag("noShellInner")) {
    base.shellInnerLayer = false;
  }
  if (readSearchFlag("noDepthSplit")) {
    base.depthSplitForeground = false;
  }
  if (base.singleInnerPhoto) {
    base.depthSplitForeground = false;
  }
  if (readSearchFlag("photoMorphTwin")) {
    base.singleInnerPhoto = false;
  }
  if (readSearchFlag("noGlow") || tier === "simplified") {
    base.shellGlow = false;
  }

  return base;
}

export function resolveShowcaseGpuTier(
  ctx: ShowcaseGpuProfileContext = {}
): ShowcaseGpuTier {
  if (typeof window !== "undefined") {
    if (isLocalGpuExportSession() || isLocalGpuSession()) {
      return "full";
    }
    if (isCloudGpuSession()) {
      return "simplified";
    }
  }
  if (ctx.forceWebGl1 || ctx.gpuSafeSession) {
    return "simplified";
  }
  if (isGpuSafeMode() || isLocalhostInteractivePreview()) {
    return "simplified";
  }
  return "full";
}

/** Collider-only preview when physics subsystem is off. */
export function shouldUseKinematicShowcasePreview(
  flags: ShowcaseSubsystemFlags = resolveShowcaseSubsystemFlags()
): boolean {
  return !flags.physics;
}

/** Simplified + physics: spawn jewel with kinematic stub, enable Havok after stable frames. */
export function shouldDeferHavokUntilJewelStable(
  flags: ShowcaseSubsystemFlags = resolveShowcaseSubsystemFlags(),
  tier: ShowcaseGpuTier = resolveShowcaseGpuTier()
): boolean {
  if (isRenderWorkerExportSession()) {
    return false;
  }
  return tier === "simplified" && flags.physics;
}

/** Delay before pipeline `playing` on low-GPU hosts — must exceed director tick gate + jewel compile. */
export function getShowcaseConservativePlayingDelayMs(
  ctx: ShowcaseGpuProfileContext = {}
): number {
  const tier = resolveShowcaseGpuTier(ctx);
  if (tier !== "simplified") {
    return 0;
  }
  if (typeof window !== "undefined" && isLocalhostInteractivePreview() && !isGpuSafeMode()) {
    return 1_500;
  }
  const flags = resolveShowcaseSubsystemFlags(tier);
  const kinematic = shouldUseKinematicShowcasePreview(flags);
  const deferHavok = shouldDeferHavokUntilJewelStable(flags, tier);
  const directorMs = kinematic ? 3_000 : deferHavok ? 5_000 : 4_000;
  return directorMs + 1_200;
}

export function resolveShowcaseGpuBudget(
  ctx: ShowcaseGpuProfileContext = {},
  imageCount = 1
): ShowcaseGpuBudget {
  const tier = resolveShowcaseGpuTier(ctx);
  if (isLocalGpuSession() && !isLocalGpuExportSession()) {
    const budget = { ...SHOWCASE_LOCAL_GPU_INTERACTIVE_BUDGET };
    budget.subsystems = resolveShowcaseSubsystemFlags("full");
    return budget;
  }
  const budget = isLocalGpuExportSession()
    ? { ...SHOWCASE_LOCAL_GPU_EXPORT_BUDGET }
    : tier === "simplified"
      ? { ...SHOWCASE_GPU_SIMPLIFIED_BUDGET }
      : { ...SHOWCASE_GPU_FULL_BUDGET };
  if (typeof window !== "undefined" && isLocalhostInteractivePreview() && !isLocalGpuExportSession()) {
    budget.hardwareScalingLevel = Math.max(budget.hardwareScalingLevel, 4);
    budget.textureMaxEdge = Math.min(budget.textureMaxEdge, 1024);
    budget.cubeTextureSize = Math.min(budget.cubeTextureSize, 1024);
    budget.maxAnisotropy = Math.min(budget.maxAnisotropy, 2);
  }
  budget.subsystems = resolveShowcaseSubsystemFlags(tier);
  if (imageCount > 1 && !isLocalGpuExportSession()) {
    const scale = Math.max(0.55, 1 - (imageCount - 1) * 0.06);
    budget.textureMaxEdge = Math.max(512, Math.floor(budget.textureMaxEdge * scale));
    budget.cubeTextureSize = Math.max(512, Math.floor(budget.cubeTextureSize * scale));
    budget.hardwareScalingLevel = Math.min(
      8,
      budget.hardwareScalingLevel + Math.floor((imageCount - 1) / 2)
    );
  }
  return budget;
}
