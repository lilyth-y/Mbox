import { Engine } from "@babylonjs/core/Engines/engine";

import "@babylonjs/core/Rendering/edgesRenderer";

import { Scene } from "@babylonjs/core/scene";

import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";

import { TransformNode } from "@babylonjs/core/Meshes/transformNode";

import {
  createShowcaseBabylonEngine,
  isBabylonGlContextLost,
  waitForCanvasLayout,
  waitForGpuStableFrames,
} from "./babylonCanvasGuard";
import {
  isShowcaseShellUpgradeInFlight,
  markShowcaseGlassUpgradeSkipped,
} from "./showcaseGlassUpgrade";
import {
  registerShowcaseRenderResume,
  unregisterShowcaseRenderResume,
} from "./showcaseRenderControl";

import type { ProcessedImage } from "../../../shared/types";

import {

  createShowcasePipelineDirector,

  calibrateShowcaseAerialAnchor,

  cloneShowcasePipelineConfig,

  CLOUD_SHOWCASE_PIPELINE_CONFIG,

  DEFAULT_SHOWCASE_PIPELINE_CONFIG,

  getShowcaseAerialAnchor,

  type ShowcasePipelineConfig,

  type ShowcasePipelineDirector,

  type ShowcasePipelineStageId,

} from "../pipeline";

import {
  DEFAULT_SHOWCASE_PRESENTATION_PREFERENCES,
  type ShowcasePresentationPreferences,
} from "../pipeline/showcasePresentationPreferences";

import {

  bindShowcaseCameraToCube,

  computeShowcaseFramingRadius,

  configureShowcaseArcCamera,

} from "../pipeline/showcaseCamera";

import {

  disposeHoloContentCache,

  preloadHoloContentTextures,
  prefetchDeferredHoloContentTextures,

  resolveHoloContentCacheKey,

  type HoloContentTextures,

  type HoloRasterProfile,

} from "./holoContentTextures";

import { createShowcaseJewelLighting } from "./showcaseJewelLighting";
import { bindShowcaseJewelLighting } from "../pipeline/holoDisplayStack";
import type { ShowcaseCatalogOptions } from "../showcaseCatalogOptions";
import { DEFAULT_SHOWCASE_CATALOG } from "../showcaseCatalogOptions";
import { createWeddingChapelEnvironment, applyShowcaseChapelOpaqueClear } from "./weddingChapelEnvironment";
import {
  createShowcaseShellGlow,
  disposeShowcaseShellGlow,
} from "./showcaseShellGlow";
import {
  applyShowcaseDomBackdropSceneDefaults,
  createShowcaseBackdropLighting,
} from "./showcaseBackdropLighting";
import {
  bindShowcaseBackdropSpillTarget,
  disposeShowcaseBackdropSpill,
  tickShowcaseCrystalBackdropSpill,
} from "./showcaseCrystalBackdropSpill";
import { resetShowcaseBackgroundLightingState, setShowcaseBackgroundLightingState } from "./showcaseBackgroundState";
import {
  bindShowcaseCatalogColors,
  resetShowcaseCatalogColorState,
} from "./showcaseCatalogColorState";
import { applyShowcaseCrystalCatalogToShell } from "./showcaseCrystalColor";
import { applyShowcaseFrameSettingsToRig } from "./showcasePhotoFrameColor";
import { applyJewelCrystalScale } from "./showcaseJewelScale";
import { resolveShowcaseGpuBudget, type ShowcaseGpuBudget } from "../showcaseGpuProfile";
import { gpuSpreadFrameGap, waitGpuFrames } from "./showcaseGpuLoadScheduler";
import { resolveShowcaseBackgroundMediaPath } from "../showcaseBackgroundMedia";
import { isShowcaseAutomationSession } from "../showcaseAutomation";
import { isGpuSafeMode, isLocalGpuSession, isLocalhostInteractivePreview } from "../../../shared/lib/gpuSession";
import { isLocalGpuExportSession } from "../../../shared/lib/renderExportProfile";
import {
  finalizeShowcaseResourceReport,
  markShowcaseInitPhase,
  startShowcaseInitProfile,
  bindShowcaseProfileScene,
} from "./showcaseInitProfiler";
import { isRenderWorkerExportSession } from "../../../shared/lib/renderExportProfile";
import {
  getShowcasePresetBackdropSample,
} from "./showcasePresetBackdrop";
import { updateHarmonyInfluence } from "./showcaseHarmonyState";
import {
  bindShowcaseBackdropLighting,
  disposeShowcaseBackdropLightingBinding,
  tickShowcaseBackdropLighting,
} from "../pipeline/showcaseMediaBackdropStack";
import {
  createShowcaseMediaBackdrop,
  type ShowcaseMediaBackdropRig,
} from "./showcaseMediaBackdrop";



export type ShowcaseExportViewportOptions = {
  preserveCameraRadius?: boolean;
  cameraRadius?: number;
};

export interface ShowcaseViewportLayout {
  parentWidth: string;
  parentHeight: string;
  cameraRadius: number;
}

export interface ShowcasePhysicsSceneHandle {

  director: ShowcasePipelineDirector;

  /** Parent node at the aerial jewel slot — attach future holo / VFX props here. */
  aerialRig: TransformNode;

  getStageId: () => ShowcasePipelineStageId;

  getContentManifest: () => import("../pipeline/showcaseStageVersions").ShowcaseContentManifest;

  getImageIndex: () => number;

  setPlaying: (playing: boolean) => void;

  setPresentationPreferences: (prefs: ShowcasePresentationPreferences) => void;

  getPresentationPreferences: () => ShowcasePresentationPreferences;

  setExportRecording: (active: boolean) => void;

  setExportCadenceFps: (fps: number) => void;

  /** Frame-locked export — one sim tick + render per frame at target fps (local GPU MP4). */
  recordPacedExportFrames: (
    frameCount: number,
    fps: number,
    options?: {
      onFrame?: (frameIndex: number) => void;
      onAfterSimFrame?: () => void;
    }
  ) => Promise<void>;

  setImages: (images: ProcessedImage[]) => Promise<void>;

  snapshotViewportLayout: () => ShowcaseViewportLayout;

  applyExportViewport: (
    exportSize: number,
    opts?: ShowcaseExportViewportOptions
  ) => void;

  restoreViewportLayout: (layout: ShowcaseViewportLayout) => void;

  getRecordingStream: (fps?: number) => MediaStream;

  getCanvas: () => HTMLCanvasElement;

  onAfterRender: (fn: () => void) => () => void;

  /** Mount in-scene video/image plane for MP4 export (canvas capture includes backdrop). */
  mountExportMediaBackdrop: (
    catalogOptions: ShowcaseCatalogOptions,
    sourceElement?: HTMLVideoElement | HTMLImageElement | null
  ) => Promise<boolean>;

  unmountExportMediaBackdrop: (catalogOptions: ShowcaseCatalogOptions) => void;

  /** Keep WebGL clear transparent so 2D composite can paint DOM/video backdrop underneath. */
  enterExportCompositeMode: (
    catalogOptions: ShowcaseCatalogOptions,
    opts?: { preserveInSceneBackdrop?: boolean }
  ) => void;

  exitExportCompositeMode: (catalogOptions: ShowcaseCatalogOptions) => void;

  resize: () => void;

  updateBackdropMedia: (
    element: HTMLVideoElement | HTMLImageElement | null,
    catalog: ShowcaseCatalogOptions
  ) => void;

  updateCatalogDisplay: (catalog: ShowcaseCatalogOptions) => void;

  /** Shape / layout / frame — reload jewel textures without Havok scene teardown. */
  updateJewelProfile: (
    catalog: ShowcaseCatalogOptions,
    images: ProcessedImage[]
  ) => Promise<void>;

  /** Lighter recovery than full scene teardown — drop video lighting / glow, lower resolution. */
  applySafeGpuRecovery: () => void;

  isGlContextLost: () => boolean;

  dispose: () => void;

}

export const SHOWCASE_SCENE_INIT_CANCELLED = "SHOWCASE_SCENE_INIT_CANCELLED";

function assertShowcaseSceneInitContinues(shouldContinue?: () => boolean): void {
  if (shouldContinue && !shouldContinue()) {
    throw new Error(SHOWCASE_SCENE_INIT_CANCELLED);
  }
}

function disposePartialShowcaseScene(engine: Engine, scene: Scene): void {
  engine.stopRenderLoop();
  scene.dispose();
  engine.dispose();
}

function resolveHoloPreloadImmediateCount(imageCount: number, localGpuPath: boolean): number {
  if (imageCount <= 0) {
    return 1;
  }
  if (localGpuPath) {
    return imageCount;
  }
  if (isLocalhostInteractivePreview() && imageCount <= 12) {
    return imageCount;
  }
  return imageCount > 1 ? 1 : imageCount;
}

function buildHoloPreloadOptions(
  imageCount: number,
  localGpuPath: boolean,
  tier: ShowcaseGpuBudget["tier"]
) {
  const immediateCount = resolveHoloPreloadImmediateCount(imageCount, localGpuPath);
  return {
    sequential: tier === "simplified" || (imageCount > 1 && !localGpuPath),
    immediateCount,
  };
}



export async function createShowcasePhysicsScene(

  canvas: HTMLCanvasElement,

  images: ProcessedImage[],

  options?: {
    catalog?: ShowcaseCatalogOptions;
    /** DOM video/img behind canvas — background plays as-is. */
    backdropMediaElement?: HTMLVideoElement | HTMLImageElement | null;
    /** Layer that receives crystal light spill onto the backdrop video. */
    backdropSpillElement?: HTMLElement | null;
    pipelineConfig?: ShowcasePipelineConfig;
    presentationPrefs?: ShowcasePresentationPreferences;
    /** Abort mid-init when React effect cleans up (prevents context loss on stale engines). */
    shouldContinue?: () => boolean;
    onWebGLContextLost?: () => void;
    onWebGLContextRestored?: () => void;
    /** After any context loss this session — skip glow / video backdrop lighting. */
    gpuSafeSession?: boolean;
    /** Windows fallback after WebGL2 context loss — use WebGL1 on a fresh canvas. */
    forceWebGl1?: boolean;
    /** Prior hard-rebuild count this session — escalates GPU throttling. */
    contextLossRecoveryAttempt?: number;
  }
): Promise<ShowcasePhysicsSceneHandle> {

  const catalog = options?.catalog ?? DEFAULT_SHOWCASE_CATALOG;
  const gpuSafeSession = options?.gpuSafeSession ?? false;
  const gpuBudget = resolveShowcaseGpuBudget(
    {
      gpuSafeSession,
      forceWebGl1: options?.forceWebGl1 ?? false,
    },
    images.length
  );
  const recoveryAttempt = Math.max(0, options?.contextLossRecoveryAttempt ?? 0);
  const localGpuPath = isLocalGpuSession();
  const localGpuRecoveryMode = localGpuPath && recoveryAttempt > 0;

  let partialEngine: Engine | null = null;
  let partialScene: Scene | null = null;

  try {
  startShowcaseInitProfile();
  await waitForCanvasLayout(canvas);
  assertShowcaseSceneInitContinues(options?.shouldContinue);

  const engine = createShowcaseBabylonEngine(
    canvas,
    !isLocalGpuSession() && (gpuSafeSession || isGpuSafeMode()),
    options?.forceWebGl1 ?? false
  );
  partialEngine = engine;
  const automation = isShowcaseAutomationSession();
  const scalingBase =
    automation && !localGpuPath
      ? Math.max(8, gpuBudget.hardwareScalingLevel)
      : gpuBudget.hardwareScalingLevel;
  try {
    engine.setHardwareScalingLevel(scalingBase + recoveryAttempt * 1.5);
  } catch {
    // ignore
  }
  assertShowcaseSceneInitContinues(options?.shouldContinue);

  const scene = new Scene(engine);
  partialScene = scene;
  if (localGpuPath || gpuSafeSession) {
    scene.blockMaterialDirtyMechanism = true;
  }
  bindShowcaseProfileScene(engine, scene);
  markShowcaseInitPhase("engine", `scaling=${gpuBudget.hardwareScalingLevel}`);

  const assertContextAlive = (): void => {
    if (isBabylonGlContextLost(engine)) {
      throw new Error(SHOWCASE_SCENE_INIT_CANCELLED);
    }
  };

  const holoRasterProfile: HoloRasterProfile = {
    shapeId: catalog.shapeId,
    photoLayout: catalog.photoLayout,
    textureMaxEdge: gpuBudget.textureMaxEdge,
    cubeTextureSize: gpuBudget.cubeTextureSize,
  };

  const maxAnisotropy = Math.min(
    engine.getCaps().maxAnisotropy ?? 16,
    gpuBudget.maxAnisotropy
  );

  const usesDomBackdrop =
    catalog.backgroundMediaSource !== "none" &&
    Boolean(resolveShowcaseBackgroundMediaPath(catalog));
  const subsystems = gpuBudget.subsystems;
  const kinematicPreview = true;
  const skipChapelPanorama =
    usesDomBackdrop ||
    !subsystems.chapelPanorama ||
    (isLocalGpuExportSession() && catalog.backgroundPreset !== "booth") ||
    localGpuRecoveryMode;

  const holoPreloadOptions = buildHoloPreloadOptions(images.length, localGpuPath, gpuBudget.tier);
  const holoImmediateCount = holoPreloadOptions.immediateCount;

  if (gpuBudget.tier === "simplified" || localGpuPath) {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
    assertShowcaseSceneInitContinues(options?.shouldContinue);
    assertContextAlive();
  }

  let chapel: Awaited<ReturnType<typeof createWeddingChapelEnvironment>>;
  let holoContentCache: Map<string, HoloContentTextures>;
  let jewelProfileUpdateGen = 0;

  chapel = await createWeddingChapelEnvironment(scene, {
    backgroundPreset: catalog.backgroundPreset,
    groundEnabled: false,
    skipPanorama: skipChapelPanorama,
    panoramaCanvasSize: gpuBudget.panoramaCanvasSize,
    envCubemapSize: gpuBudget.envCubemapSize,
    photoDomeResolution: gpuBudget.photoDomeResolution,
  });
  assertShowcaseSceneInitContinues(options?.shouldContinue);
  assertContextAlive();
  markShowcaseInitPhase(
    "chapel",
    `panorama=${!skipChapelPanorama} env=${gpuBudget.envCubemapSize}`
  );

  if (gpuBudget.tier === "simplified" || localGpuPath) {
    await waitGpuFrames(gpuSpreadFrameGap());
    assertShowcaseSceneInitContinues(options?.shouldContinue);
    assertContextAlive();
  }

  holoContentCache = await preloadHoloContentTextures(
    scene,
    images,
    holoRasterProfile,
    maxAnisotropy,
    holoPreloadOptions
  );
  assertContextAlive();
  markShowcaseInitPhase(
    "holo_textures",
    `${images.length} images maxEdge=${gpuBudget.textureMaxEdge}`
  );

  assertShowcaseSceneInitContinues(options?.shouldContinue);

  bindShowcaseCatalogColors(catalog);

  if (options?.backdropSpillElement) {
    bindShowcaseBackdropSpillTarget(options.backdropSpillElement);
  }

  const imageUrls = images.map((image) => image.url);



  const runtime = {

    getHoloContent: (sourceUrl: string): HoloContentTextures => {

      const cached = holoContentCache.get(
        resolveHoloContentCacheKey(sourceUrl, holoRasterProfile)
      );

      if (!cached) {

        throw new Error(`[showcase] holo content not preloaded: ${sourceUrl.slice(0, 80)}`);

      }

      return cached;

    },

    getPhotoTexture: (sourceUrl: string) => runtime.getHoloContent(sourceUrl).composite,

    applyShellReflection: chapel.applyShellReflection,

  };



  const pipelineConfig = cloneShowcasePipelineConfig(
    options?.pipelineConfig ??
      (isRenderWorkerExportSession() || automation
        ? CLOUD_SHOWCASE_PIPELINE_CONFIG
        : DEFAULT_SHOWCASE_PIPELINE_CONFIG)
  );

  const camera = new ArcRotateCamera(

    "showcaseCam",

    pipelineConfig.showcaseCameraAlpha,

    pipelineConfig.showcaseCameraBeta,

    5.35,

    pipelineConfig.showcaseCenter.clone(),

    scene

  );

  configureShowcaseArcCamera(camera);

  camera.attachControl(canvas, true);

  calibrateShowcaseAerialAnchor(pipelineConfig, camera);

  bindShowcaseCameraToCube(camera, pipelineConfig, pipelineConfig.showcaseCenter);

  const aerialRig = new TransformNode("showcaseAerialRig", scene);

  aerialRig.position.copyFrom(getShowcaseAerialAnchor(pipelineConfig, 0));

  const jewelLighting = createShowcaseJewelLighting(
    scene,
    pipelineConfig.showcaseCenter.clone()
  );
  bindShowcaseJewelLighting(jewelLighting);
  markShowcaseInitPhase("camera_lights");

  let glowTimer: number | null = null;
  const scheduleShellGlow = () => {
    if (!subsystems.shellGlow || gpuSafeSession || isLocalGpuExportSession()) {
      return;
    }
    if (glowTimer !== null) {
      window.clearTimeout(glowTimer);
    }
    const delayMs = usesDomBackdrop ? 5_000 : 800;
    glowTimer = window.setTimeout(() => {
      glowTimer = null;
      if (!engine.isDisposed && !scene.isDisposed) {
        createShowcaseShellGlow(scene);
      }
    }, delayMs);
  };
  scheduleShellGlow();

  let backdropLighting: ReturnType<typeof createShowcaseBackdropLighting> | null = null;
  let backdropAttachTimer: number | null = null;
  let lastBackdropElement: HTMLVideoElement | HTMLImageElement | null | undefined;
  let lastBackdropMediaPath: string | null = null;

  let hadContextLoss = false;
  const applyLightGpuRecovery = () => {
    if (backdropAttachTimer !== null) {
      window.clearTimeout(backdropAttachTimer);
      backdropAttachTimer = null;
    }
    if (glowTimer !== null) {
      window.clearTimeout(glowTimer);
      glowTimer = null;
    }
    try {
      engine.setHardwareScalingLevel(Math.max(engine.getHardwareScalingLevel(), 2));
    } catch {
      // ignore
    }
    backdropLighting?.dispose();
    backdropLighting = null;
    lastBackdropElement = undefined;
    lastBackdropMediaPath = null;
    bindShowcaseBackdropLighting(null);
    disposeShowcaseShellGlow();
  };

  const contextLostObserver = engine.onContextLostObservable.add(() => {
    hadContextLoss = true;
    console.warn("[showcase] Babylon onContextLostObservable fired");
    engine.stopRenderLoop();
    if (isShowcaseShellUpgradeInFlight()) {
      markShowcaseGlassUpgradeSkipped();
      return;
    }
    options?.onWebGLContextLost?.();
  });

  const canSceneRender = (): boolean =>
    !engine.isDisposed && !scene.isDisposed && !isBabylonGlContextLost(engine);

  const runSafeRenderLoop = (): void => {
    if (!canSceneRender()) {
      return;
    }
    engine.stopRenderLoop();
    engine.runRenderLoop(() => {
      if (!canSceneRender()) {
        engine.stopRenderLoop();
        return;
      }
      try {
        scene.render();
      } catch (error) {
        engine.stopRenderLoop();
        console.warn("[showcase] render stopped after WebGL error", error);
      }
    });
  };

  const onCanvasContextRestored = () => {
    if (engine.isDisposed || scene.isDisposed) {
      return;
    }
    if (hadContextLoss && !isLocalGpuSession()) {
      applyLightGpuRecovery();
    }
    if (!canSceneRender()) {
      return;
    }
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        runSafeRenderLoop();
        options?.onWebGLContextRestored?.();
      });
    });
  };
  canvas.addEventListener("webglcontextrestored", onCanvasContextRestored);

  const applyBackdropPresentationMode = (
    catalogOptions: ShowcaseCatalogOptions,
    _element: HTMLVideoElement | HTMLImageElement | null
  ) => {
    const mediaPath = resolveShowcaseBackgroundMediaPath(catalogOptions);
    const usesDomBackdrop =
      catalogOptions.backgroundMediaSource !== "none" && Boolean(mediaPath);

    if (usesDomBackdrop) {
      applyShowcaseDomBackdropSceneDefaults(scene);
      chapel.dome?.mesh.setEnabled(false);
      chapel.ground?.setEnabled(false);
      return;
    }

    applyShowcaseChapelOpaqueClear(scene, chapel.backgroundPreset);
    chapel.dome?.mesh.setEnabled(chapel.backgroundPreset === "booth");
    chapel.ground?.setEnabled(catalogOptions.groundEnabled);
  };

  const attachBackdropMedia = (
    element: HTMLVideoElement | HTMLImageElement | null,
    catalogOptions: ShowcaseCatalogOptions
  ) => {
    const mediaPath = resolveShowcaseBackgroundMediaPath(catalogOptions);
    const pathKey = mediaPath ?? "";
    const lightingElement =
      gpuSafeSession && element instanceof HTMLVideoElement ? null : element;

    if (
      backdropLighting &&
      lastBackdropElement === lightingElement &&
      lastBackdropMediaPath === pathKey
    ) {
      applyBackdropPresentationMode(catalogOptions, element);
      setShowcaseBackgroundLightingState({
        influence: catalogOptions.backgroundLightInfluence,
      });
      return;
    }

    lastBackdropElement = lightingElement;
    lastBackdropMediaPath = pathKey;

    backdropLighting?.dispose();
    backdropLighting = null;

    applyBackdropPresentationMode(catalogOptions, element);

    if (mediaPath && !lightingElement) {
      bindShowcaseBackdropLighting(null);
      return;
    }

    if (mediaPath && lightingElement) {
      backdropLighting = createShowcaseBackdropLighting(scene, {
        source: lightingElement,
        influence: catalogOptions.backgroundLightInfluence,
      });
      bindShowcaseBackdropLighting(backdropLighting);
      return;
    }

    backdropLighting = createShowcaseBackdropLighting(scene, {
      staticSample: getShowcasePresetBackdropSample(catalogOptions.backgroundPreset),
      influence: catalogOptions.backgroundLightInfluence,
    });
    bindShowcaseBackdropLighting(backdropLighting);
  };

  attachBackdropMedia(options?.backdropMediaElement ?? null, catalog);
  markShowcaseInitPhase(
    "backdrop",
    options?.backdropMediaElement ? "dom-media" : "static"
  );

  let exportBackdropRig: ShowcaseMediaBackdropRig | null = null;

  engine.resize();

  if (gpuBudget.tier === "simplified") {
    runSafeRenderLoop();
    assertShowcaseSceneInitContinues(options?.shouldContinue);
    const chapelStable = await waitForGpuStableFrames(
      engine,
      6,
      options?.shouldContinue,
      18_000
    );
    if (chapelStable === "cancelled") {
      throw new Error(SHOWCASE_SCENE_INIT_CANCELLED);
    }
    if (chapelStable === "context_lost") {
      options?.onWebGLContextLost?.();
      throw new Error(SHOWCASE_SCENE_INIT_CANCELLED);
    }
    assertContextAlive();
    markShowcaseInitPhase("stable_frames", "pre-director");
  } else if (localGpuPath && !localGpuRecoveryMode) {
    const preDirectorStable = await waitForGpuStableFrames(
      engine,
      4,
      options?.shouldContinue,
      15_000
    );
    if (preDirectorStable === "cancelled") {
      throw new Error(SHOWCASE_SCENE_INIT_CANCELLED);
    }
    if (preDirectorStable === "context_lost") {
      options?.onWebGLContextLost?.();
      throw new Error(SHOWCASE_SCENE_INIT_CANCELLED);
    }
    await waitGpuFrames(gpuSpreadFrameGap());
    assertContextAlive();
    markShowcaseInitPhase("stable_frames", "pre-director");
  } else if (localGpuRecoveryMode) {
    await waitGpuFrames(gpuSpreadFrameGap() * 2);
    assertContextAlive();
    markShowcaseInitPhase("stable_frames", "recovery-skip");
  }

  const director = createShowcasePipelineDirector(scene, camera, imageUrls, {
    runtime,
    config: pipelineConfig,
    catalog,
    presentationPrefs:
      options?.presentationPrefs ?? DEFAULT_SHOWCASE_PRESENTATION_PREFERENCES,
  });
  markShowcaseInitPhase("director");

  /** Jewel spawn — block init on fullGpu export path; localhost interactive loads async. */
  if (localGpuPath) {
    director.setPlaying(true);
    const jewelBootstrapDeadline = performance.now() + 180_000;
    while (!director.getRig() && performance.now() < jewelBootstrapDeadline) {
      assertShowcaseSceneInitContinues(options?.shouldContinue);
      if (isBabylonGlContextLost(engine)) {
        options?.onWebGLContextLost?.();
        throw new Error(SHOWCASE_SCENE_INIT_CANCELLED);
      }
      director.tick(33);
      await waitGpuFrames(2);
    }
    if (!director.getRig()) {
      throw new Error("[showcase] jewel bootstrap timed out");
    }
    scene.blockMaterialDirtyMechanism = false;
    await waitGpuFrames(gpuSpreadFrameGap());
    assertContextAlive();
  } else if (gpuBudget.tier === "simplified") {
    director.setPlaying(true);
    const interactiveDeadline = performance.now() + 45_000;
    while (!director.getRig() && performance.now() < interactiveDeadline) {
      assertShowcaseSceneInitContinues(options?.shouldContinue);
      if (isBabylonGlContextLost(engine)) {
        options?.onWebGLContextLost?.();
        throw new Error(SHOWCASE_SCENE_INIT_CANCELLED);
      }
      director.tick(33);
      await waitGpuFrames(6);
    }
    await waitGpuFrames(gpuSpreadFrameGap());
    assertContextAlive();
  }

  if (images.length > holoImmediateCount) {
    void (async () => {
      const deadline = Date.now() + 90_000;
      while (Date.now() < deadline) {
        if (engine.isDisposed || scene.isDisposed || isBabylonGlContextLost(engine)) {
          return;
        }
        if (options?.shouldContinue && !options.shouldContinue()) {
          return;
        }
        if (director.getRig()) {
          break;
        }
        await waitGpuFrames(6);
      }
      if (!director.getRig() || isBabylonGlContextLost(engine)) {
        return;
      }
      await waitGpuFrames(48);
      if (engine.isDisposed || isBabylonGlContextLost(engine)) {
        return;
      }
      try {
        await prefetchDeferredHoloContentTextures(
          scene,
          images,
          holoRasterProfile,
          holoContentCache,
          maxAnisotropy,
          holoImmediateCount
        );
      } catch (error) {
        console.warn("[showcase] deferred holo texture prefetch", error);
      }
    })();
  }



  let lastTick = performance.now();
  let exportCadenceFps = 60;
  let exportFixedDtMs = 1000 / exportCadenceFps;
  let exportSimDebtMs = 0;
  let exportPacedStepActive = false;
  const cloudRenderWorker =
    isShowcaseAutomationSession() &&
    !isLocalGpuExportSession() &&
    gpuBudget.tier === "simplified";
  const directorTickEnabledAt =
    cloudRenderWorker || localGpuPath || isShowcaseAutomationSession()
      ? 0
      : gpuBudget.tier === "simplified"
        ? performance.now() + recoveryAttempt * 500
        : 0;

  const observer = scene.onBeforeRenderObservable.add(() => {
    if (!canSceneRender()) {
      return;
    }

    try {
    const now = performance.now();
    if (directorTickEnabledAt > 0 && now < directorTickEnabledAt) {
      lastTick = now;
      return;
    }
    let dtMs = exportFixedDtMs;
    if (exportPacedStepActive) {
      exportPacedStepActive = false;
      lastTick = now;
      exportSimDebtMs = 0;
      director.tick(exportFixedDtMs);
    } else {
      const rawDt = now - lastTick;
      lastTick = now;

      if (director.getExportRecording()) {
        exportSimDebtMs += rawDt;
        const stepMs = exportFixedDtMs;
        let steps = 0;
        const maxCatchUpSteps = 1;
        while (exportSimDebtMs >= stepMs * 0.5 && steps < maxCatchUpSteps) {
          director.tick(stepMs);
          exportSimDebtMs -= stepMs;
          steps += 1;
        }
        if (steps >= maxCatchUpSteps) {
          exportSimDebtMs = Math.min(exportSimDebtMs, stepMs);
        }
        dtMs = exportFixedDtMs;
      } else {
        exportSimDebtMs = 0;
        dtMs = Math.min(rawDt, 50);
        director.tick(dtMs);
      }
    }

    const rig = director.getRig();
    tickShowcaseBackdropLighting(
      dtMs,
      rig?.shellMaterial ?? null,
      rig?.shellInnerMaterial ?? null
    );

    tickShowcaseCrystalBackdropSpill(
      scene,
      camera,
      engine,
      director.getRig() ?? null,
      dtMs
    );

    aerialRig.position.copyFrom(
      director.getRig()?.collider.getAbsolutePosition() ??
        getShowcaseAerialAnchor(pipelineConfig, director.totalElapsedMs)
    );

    } catch (error) {
      if (isBabylonGlContextLost(engine)) {
        engine.stopRenderLoop();
        return;
      }
      console.warn("[showcase] frame tick skipped", error);
    }

  });



  if (!localGpuPath) {
    runSafeRenderLoop();
    registerShowcaseRenderResume(engine, runSafeRenderLoop);
  }

  assertShowcaseSceneInitContinues(options?.shouldContinue);
  assertContextAlive();

  if (gpuBudget.tier === "simplified" || localGpuPath) {
    const postPhysicsStable = await waitForGpuStableFrames(
      engine,
      localGpuPath ? 6 : 3,
      options?.shouldContinue,
      localGpuPath ? 18_000 : 12_000
    );
    if (postPhysicsStable === "cancelled") {
      throw new Error(SHOWCASE_SCENE_INIT_CANCELLED);
    }
    if (postPhysicsStable === "context_lost") {
      options?.onWebGLContextLost?.();
      throw new Error(SHOWCASE_SCENE_INIT_CANCELLED);
    }
    assertContextAlive();
    if (localGpuPath) {
      runSafeRenderLoop();
      registerShowcaseRenderResume(engine, runSafeRenderLoop);
    } else if (gpuSafeSession) {
      scene.blockMaterialDirtyMechanism = false;
    }
    markShowcaseInitPhase("stable_frames", "post-director");
  }



  const onResize = () => {
    if (!canSceneRender()) {
      return;
    }
    try {
      engine.resize();
      camera.radius = computeShowcaseFramingRadius(
        camera,
        undefined,
        pipelineConfig.cameraFloatFramingFill
      );
    } catch (error) {
      console.warn("[showcase] resize skipped after WebGL error", error);
    }
  };

  window.addEventListener("resize", onResize);



  const mergeHoloCache = (nextCache: Map<string, HoloContentTextures>) => {

    for (const [key, entry] of nextCache) {

      const prev = holoContentCache.get(key);

      if (prev && prev !== entry) {

        if (prev.composite !== entry.composite) prev.composite.dispose();

        if (prev.background !== entry.background && prev.background !== prev.composite) {

          prev.background.dispose();

        }

        if (prev.foreground && prev.foreground !== entry.foreground) {

          prev.foreground.dispose();

        }

      }

      holoContentCache.set(key, entry);

    }

  };



  finalizeShowcaseResourceReport({
    kinematicPreview: kinematicPreview,
    gpuTier: gpuBudget.tier,
    scene,
    engine,
  });

  return {

    director,

    aerialRig,

    getStageId: () => director.stageId,

    getContentManifest: () => director.getContentManifest(),

    getImageIndex: () => director.imageIndex,

    setPlaying: (playing) => director.setPlaying(playing),

    setPresentationPreferences: (prefs) => director.setPresentationPreferences(prefs),

    getPresentationPreferences: () => director.getPresentationPreferences(),

    setExportRecording: (active) => director.setExportRecording(active),

    setExportCadenceFps: (fps) => {
      exportCadenceFps = Math.max(1, fps);
      exportFixedDtMs = 1000 / exportCadenceFps;
      exportSimDebtMs = 0;
    },

    recordPacedExportFrames: async (frameCount, fps, options) => {
      if (!canSceneRender()) {
        throw new Error("[showcase] paced export unavailable — scene not renderable");
      }
      engine.stopRenderLoop();
      const logEvery = Math.max(60, Math.round(fps * 2));
      const frameBudgetMs = 1000 / Math.max(1, fps);
      try {
        for (let i = 0; i < frameCount; i++) {
          if (!canSceneRender()) {
            break;
          }
          const frameStart = performance.now();
          options?.onFrame?.(i);
          exportPacedStepActive = true;
          try {
            scene.render();
          } catch (error) {
            console.warn("[showcase] paced export frame failed", error);
            break;
          }
          options?.onAfterSimFrame?.();
          if (i > 0 && i % logEvery === 0) {
            console.info(`[showcase] paced export ${i}/${frameCount}`);
          }
          // captureStream(0): one requestFrame per paint — cap wall rate so MediaRecorder keeps every frame.
          const elapsed = performance.now() - frameStart;
          const waitMs = Math.max(0, frameBudgetMs - elapsed);
          if (waitMs > 0) {
            await new Promise<void>((resolve) => window.setTimeout(resolve, waitMs));
          }
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        }
        console.info(`[showcase] paced export done ${frameCount}/${frameCount}`);
      } finally {
        if (canSceneRender()) {
          runSafeRenderLoop();
        }
      }
    },

    setImages: (nextImages) => {
      const holoPreloadOptions = buildHoloPreloadOptions(
        nextImages.length,
        localGpuPath,
        gpuBudget.tier
      );
      const holoImmediateCount = holoPreloadOptions.immediateCount;

      return preloadHoloContentTextures(
        scene,
        nextImages,
        holoRasterProfile,
        maxAnisotropy,
        holoPreloadOptions
      )
        .then((nextCache) => {
          mergeHoloCache(nextCache);
          director.setImageUrls(nextImages.map((image) => image.url));
          if (nextImages.length > holoImmediateCount) {
            return prefetchDeferredHoloContentTextures(
              scene,
              nextImages,
              holoRasterProfile,
              holoContentCache,
              maxAnisotropy,
              holoImmediateCount
            );
          }
        })

        .catch((error) => {

          console.error("[showcase] failed to preload uploaded photos", error);

          throw error;

        });

    },

    snapshotViewportLayout: () => {
      const parent = canvas.parentElement;
      return {
        parentWidth: parent?.style.width ?? "",
        parentHeight: parent?.style.height ?? "",
        cameraRadius: camera.radius,
      };
    },

    applyExportViewport: (exportSize, opts) => {
      if (isLocalGpuExportSession()) {
        try {
          engine.setHardwareScalingLevel(1);
        } catch {
          // ignore
        }
      }
      engine.setSize(exportSize, exportSize, true);
      if (opts?.preserveCameraRadius && opts.cameraRadius != null) {
        camera.radius = opts.cameraRadius;
      } else {
        camera.radius = computeShowcaseFramingRadius(
          camera,
          undefined,
          pipelineConfig.cameraFloatFramingFill
        );
      }
      exportBackdropRig?.resize();
    },

    restoreViewportLayout: (layout: ShowcaseViewportLayout) => {
      const parent = canvas.parentElement;
      if (parent) {
        parent.style.width = layout.parentWidth;
        parent.style.height = layout.parentHeight;
      }
      canvas.style.width = "";
      canvas.style.height = "";
      engine.resize();
      camera.radius = layout.cameraRadius;
    },

    getRecordingStream: (fps = 30) => canvas.captureStream(fps),

    getCanvas: () => canvas,

    onAfterRender: (fn) => {
      const observer = scene.onAfterRenderObservable.add(fn);
      return () => {
        scene.onAfterRenderObservable.remove(observer);
      };
    },

    mountExportMediaBackdrop: async (catalogOptions, sourceElement) => {
      const mediaPath = resolveShowcaseBackgroundMediaPath(catalogOptions);
      if (!mediaPath) {
        return false;
      }

      exportBackdropRig?.dispose();
      exportBackdropRig = null;

      const element = sourceElement ?? lastBackdropElement ?? null;
      exportBackdropRig = await createShowcaseMediaBackdrop(scene, camera, engine, {
        mediaPath,
        opacity: catalogOptions.backgroundMediaOpacity,
        lightInfluence: 0,
        sourceElement: element,
        exportMode: true,
      });
      exportBackdropRig.resize();
      chapel.dome?.mesh.setEnabled(false);
      chapel.ground?.setEnabled(false);
      return true;
    },

    unmountExportMediaBackdrop: (catalogOptions) => {
      if (!exportBackdropRig) {
        return;
      }
      exportBackdropRig.dispose();
      exportBackdropRig = null;
      attachBackdropMedia(lastBackdropElement ?? null, catalogOptions);
    },

    enterExportCompositeMode: (catalogOptions, opts) => {
      const preserveInSceneBackdrop = opts?.preserveInSceneBackdrop === true;
      if (!preserveInSceneBackdrop && exportBackdropRig) {
        exportBackdropRig.dispose();
        exportBackdropRig = null;
      }
      attachBackdropMedia(lastBackdropElement ?? null, catalogOptions);
      applyShowcaseDomBackdropSceneDefaults(scene);
      chapel.dome?.mesh.setEnabled(false);
      chapel.ground?.setEnabled(false);
    },

    exitExportCompositeMode: (catalogOptions) => {
      attachBackdropMedia(lastBackdropElement ?? null, catalogOptions);
    },

    resize: onResize,

    updateBackdropMedia: (element, nextCatalog) => {
      bindShowcaseCatalogColors(nextCatalog);
      if (backdropAttachTimer !== null) {
        window.clearTimeout(backdropAttachTimer);
        backdropAttachTimer = null;
      }
      const lightingElement =
        gpuSafeSession && element instanceof HTMLVideoElement ? null : element;
      const delayMs = lightingElement instanceof HTMLVideoElement ? 1_200 : 0;
      if (delayMs === 0) {
        attachBackdropMedia(lightingElement, nextCatalog);
        return;
      }
      backdropAttachTimer = window.setTimeout(() => {
        backdropAttachTimer = null;
        if (engine.isDisposed || scene.isDisposed) {
          return;
        }
        attachBackdropMedia(lightingElement, nextCatalog);
      }, delayMs);
    },

    applySafeGpuRecovery: () => {
      if (isLocalGpuSession()) {
        runSafeRenderLoop();
        return;
      }
      applyLightGpuRecovery();
      runSafeRenderLoop();
    },

    isGlContextLost: () => isBabylonGlContextLost(engine),

    updateCatalogDisplay: (nextCatalog) => {
      bindShowcaseCatalogColors(nextCatalog);
      updateHarmonyInfluence(nextCatalog.backgroundLightInfluence);
      director.setCatalog(nextCatalog);
      const rig = director.getRig();
      if (rig) {
        applyJewelCrystalScale(rig, nextCatalog.crystalSizeScale);
        applyShowcaseCrystalCatalogToShell(rig);
        applyShowcaseFrameSettingsToRig(
          rig,
          nextCatalog.framePresetId,
          nextCatalog.photoFrameColorHex
        );
      }
      if (backdropLighting) {
        setShowcaseBackgroundLightingState({
          influence: nextCatalog.backgroundLightInfluence,
        });
      }
    },

    updateJewelProfile: async (nextCatalog, nextImages) => {
      const updateGen = ++jewelProfileUpdateGen;
      holoRasterProfile.shapeId = nextCatalog.shapeId;
      holoRasterProfile.photoLayout = nextCatalog.photoLayout;
      director.setCatalog(nextCatalog);
      bindShowcaseCatalogColors(nextCatalog);

      disposeHoloContentCache(holoContentCache);

      const nextCache = await preloadHoloContentTextures(
        scene,
        nextImages,
        holoRasterProfile,
        maxAnisotropy
      );
      if (updateGen !== jewelProfileUpdateGen) {
        disposeHoloContentCache(nextCache);
        return;
      }
      mergeHoloCache(nextCache);

      if (updateGen !== jewelProfileUpdateGen) {
        return;
      }

      const urls = nextImages.map((image) => image.url);
      director.reset();
      director.setImageUrls(urls);
    },

    dispose: () => {
      if (backdropAttachTimer !== null) {
        window.clearTimeout(backdropAttachTimer);
        backdropAttachTimer = null;
      }
      if (glowTimer !== null) {
        window.clearTimeout(glowTimer);
        glowTimer = null;
      }

      window.removeEventListener("resize", onResize);
      canvas.removeEventListener("webglcontextrestored", onCanvasContextRestored);

      try {
        engine.onContextLostObservable.remove(contextLostObserver);
      } catch {
        // ignore
      }

      try {
        scene.onBeforeRenderObservable.remove(observer);
      } catch {
        // ignore
      }

      try {
        director.dispose();
      } catch (error) {
        console.warn("[showcase] director dispose", error);
      }

      disposeHoloContentCache(holoContentCache);

      try {
        chapel.dispose();
        jewelLighting.dispose();
      } catch (error) {
        console.warn("[showcase] environment dispose", error);
      }

      bindShowcaseJewelLighting(null);
      disposeShowcaseShellGlow();
      backdropLighting?.dispose();
      bindShowcaseBackdropLighting(null);
      disposeShowcaseBackdropLightingBinding();
      resetShowcaseBackgroundLightingState();
      resetShowcaseCatalogColorState();
      disposeShowcaseBackdropSpill();
      exportBackdropRig?.dispose();
      exportBackdropRig = null;

      try {
        if (!engine.isDisposed) {
          engine.stopRenderLoop();
        }
        unregisterShowcaseRenderResume(engine);
        if (!scene.isDisposed) {
          scene.dispose();
        }
        if (!engine.isDisposed) {
          engine.dispose();
        }
      } catch (error) {
        console.warn("[showcase] engine dispose", error);
      }
    },

  };

  } catch (error) {
    if (partialEngine && partialScene) {
      disposePartialShowcaseScene(partialEngine, partialScene);
    } else if (partialEngine) {
      partialEngine.stopRenderLoop();
      partialEngine.dispose();
    }
    throw error;
  }

}


