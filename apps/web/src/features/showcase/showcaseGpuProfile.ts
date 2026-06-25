import { isShowcaseLowGpuHost } from "./babylon/babylonCanvasGuard";
import {
  isLocalGpuExportSession,
  isRenderWorkerExportSession,
} from "../../shared/lib/renderExportProfile";
import { readRenderJobFromWindow } from "../../shared/lib/renderJobWindow";

/** Preview / export GPU budget — full quality vs 1024-capped simplified. */
export type ShowcaseGpuTier = "full" | "simplified";

/** Per-subsystem toggles — tune with URL (?noPhysics=1 &c.) or ?safe=1 bundle. */
export type ShowcaseSubsystemFlags = {
  physics: boolean;
  domBackdropVideo: boolean;
  chapelPanorama: boolean;
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
    physics: true,
    domBackdropVideo: true,
    chapelPanorama: true,
    shellInnerLayer: true,
    depthSplitForeground: true,
    shellGlow: true,
  },
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
  exportFps: 30,
  subsystems: {
    physics: false,
    domBackdropVideo: false,
    chapelPanorama: false,
    shellInnerLayer: true,
    depthSplitForeground: true,
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

  if (readSearchFlag("noPhysics") || kinematic) {
    base.physics = false;
  }
  if (typeof window !== "undefined") {
    const physics = new URLSearchParams(window.location.search).get("physics");
    if (physics === "1") {
      base.physics = true;
    }
    if (physics === "0") {
      base.physics = false;
    }
  }
  if (readSearchFlag("noVideo") || safe) {
    base.domBackdropVideo = false;
  }
  if (readSearchFlag("noPanorama") || kinematic) {
    base.chapelPanorama = false;
  }
  if (readSearchFlag("noShellInner") || safe) {
    base.shellInnerLayer = false;
  }
  if (readSearchFlag("noDepthSplit") || safe) {
    base.depthSplitForeground = false;
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
    if (isLocalGpuExportSession()) {
      return "full";
    }
    if (new URLSearchParams(window.location.search).get("safe") === "1") {
      return "simplified";
    }
    if (readRenderJobFromWindow()) {
      return "simplified";
    }
  }
  if (ctx.forceWebGl1 || ctx.gpuSafeSession) {
    return "simplified";
  }
  if (typeof navigator !== "undefined" && isShowcaseLowGpuHost()) {
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
  const budget = isLocalGpuExportSession()
    ? { ...SHOWCASE_LOCAL_GPU_EXPORT_BUDGET }
    : tier === "simplified"
      ? { ...SHOWCASE_GPU_SIMPLIFIED_BUDGET }
      : { ...SHOWCASE_GPU_FULL_BUDGET };
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
