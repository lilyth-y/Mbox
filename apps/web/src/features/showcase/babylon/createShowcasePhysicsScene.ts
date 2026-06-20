import { Engine } from "@babylonjs/core/Engines/engine";

import "@babylonjs/core/Rendering/edgesRenderer";

import { Scene } from "@babylonjs/core/scene";

import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";

import { TransformNode } from "@babylonjs/core/Meshes/transformNode";

import { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate";

import { PhysicsShapeType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";

import { HOLOGRAM_DISPLAY_SPEC } from "@mbox/shared";

import { enableHavokPhysics } from "../../premium/babylon/physicsWorld";

import type { ProcessedImage } from "../../../shared/types";

import {

  createShowcasePipelineDirector,

  calibrateShowcaseAerialAnchor,

  cloneShowcasePipelineConfig,

  DEFAULT_SHOWCASE_PIPELINE_CONFIG,

  getShowcaseAerialAnchor,

  type ShowcasePipelineDirector,

  type ShowcasePipelineStageId,

} from "../pipeline";

import {

  bindShowcaseCameraToCube,

  computeShowcaseFramingRadius,

  configureShowcaseArcCamera,

} from "../pipeline/showcaseCamera";

import {

  disposeHoloContentCache,

  preloadHoloContentTextures,

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
import { resolveShowcaseBackgroundMediaPath } from "../showcaseBackgroundMedia";
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

  setFallPhysicsEnabled: (enabled: boolean) => void;

  getFallPhysicsEnabled: () => boolean;

  setExportRecording: (active: boolean) => void;

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

  dispose: () => void;

}



export async function createShowcasePhysicsScene(

  canvas: HTMLCanvasElement,

  images: ProcessedImage[],

  options?: {
    fallPhysicsEnabled?: boolean;
    catalog?: ShowcaseCatalogOptions;
    /** DOM video/img behind canvas — background plays as-is. */
    backdropMediaElement?: HTMLVideoElement | HTMLImageElement | null;
    /** Layer that receives crystal light spill onto the backdrop video. */
    backdropSpillElement?: HTMLElement | null;
  }
): Promise<ShowcasePhysicsSceneHandle> {

  const catalog = options?.catalog ?? DEFAULT_SHOWCASE_CATALOG;

  const engine = new Engine(canvas, true, {
    preserveDrawingBuffer: true,
    stencil: true,
    antialias: true,
    alpha: true,
    premultipliedAlpha: false,
  });



  const scene = new Scene(engine);

  await enableHavokPhysics(scene);

  const chapel = await createWeddingChapelEnvironment(scene, {
    backgroundPreset: catalog.backgroundPreset,
    groundEnabled: catalog.groundEnabled,
    skipPanorama: false,
  });

  bindShowcaseCatalogColors(catalog);

  if (options?.backdropSpillElement) {
    bindShowcaseBackdropSpillTarget(options.backdropSpillElement);
  }

  if (chapel.ground) {
    new PhysicsAggregate(
      chapel.ground,
      PhysicsShapeType.BOX,
      { mass: 0, restitution: 0.5, friction: 0.52 },
      scene
    );
  }



  const imageUrls = images.map((image) => image.url);

  const maxAnisotropy = engine.getCaps().maxAnisotropy ?? 16;

  const holoRasterProfile: HoloRasterProfile = {
    shapeId: catalog.shapeId,
    photoLayout: catalog.photoLayout,
  };

  const holoContentCache = await preloadHoloContentTextures(
    scene,
    images,
    holoRasterProfile,
    maxAnisotropy
  );



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



  const pipelineConfig = cloneShowcasePipelineConfig(DEFAULT_SHOWCASE_PIPELINE_CONFIG);

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

  createShowcaseShellGlow(scene);

  let backdropLighting: ReturnType<typeof createShowcaseBackdropLighting> | null = null;
  let lastBackdropElement: HTMLVideoElement | HTMLImageElement | null | undefined;
  let lastBackdropMediaPath: string | null = null;

  const applyBackdropPresentationMode = (
    catalogOptions: ShowcaseCatalogOptions,
    element: HTMLVideoElement | HTMLImageElement | null
  ) => {
    const mediaPath = resolveShowcaseBackgroundMediaPath(catalogOptions);
    const domActive = Boolean(mediaPath && element);

    if (domActive) {
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

    if (
      backdropLighting &&
      lastBackdropElement === element &&
      lastBackdropMediaPath === pathKey
    ) {
      applyBackdropPresentationMode(catalogOptions, element);
      setShowcaseBackgroundLightingState({
        influence: catalogOptions.backgroundLightInfluence,
      });
      return;
    }

    lastBackdropElement = element;
    lastBackdropMediaPath = pathKey;

    backdropLighting?.dispose();
    backdropLighting = null;

    applyBackdropPresentationMode(catalogOptions, element);

    if (mediaPath && element) {
      backdropLighting = createShowcaseBackdropLighting(scene, {
        source: element,
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

  let exportBackdropRig: ShowcaseMediaBackdropRig | null = null;

  engine.resize();



  const director = createShowcasePipelineDirector(scene, camera, imageUrls, {
    runtime,
    config: pipelineConfig,
    catalog,
    fallPhysicsEnabled: options?.fallPhysicsEnabled ?? HOLOGRAM_DISPLAY_SPEC.fallPhysicsDefault,
  });



  let lastTick = performance.now();
  const exportFixedDtMs = 1000 / 60;
  let exportSimDebtMs = 0;

  const observer = scene.onBeforeRenderObservable.add(() => {

    const now = performance.now();
    const rawDt = now - lastTick;
    lastTick = now;

    if (director.getExportRecording()) {
      exportSimDebtMs += rawDt;
      const maxCatchUpSteps = 8;
      let steps = 0;
      while (exportSimDebtMs >= exportFixedDtMs && steps < maxCatchUpSteps) {
        director.tick(exportFixedDtMs);
        exportSimDebtMs -= exportFixedDtMs;
        steps += 1;
      }
    } else {
      exportSimDebtMs = 0;
      director.tick(Math.min(rawDt, 50));
    }

    const dtMs = director.getExportRecording() ? exportFixedDtMs : Math.min(rawDt, 50);

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
      getShowcaseAerialAnchor(pipelineConfig, director.totalElapsedMs)
    );

  });



  engine.runRenderLoop(() => {

    scene.render();

  });



  const onResize = () => {

    engine.resize();

    camera.radius = computeShowcaseFramingRadius(camera, undefined, pipelineConfig.cameraFloatFramingFill);

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



  return {

    director,

    aerialRig,

    getStageId: () => director.stageId,

    getContentManifest: () => director.getContentManifest(),

    getImageIndex: () => director.imageIndex,

    setPlaying: (playing) => director.setPlaying(playing),

    setFallPhysicsEnabled: (enabled) => director.setFallPhysicsEnabled(enabled),

    getFallPhysicsEnabled: () => director.fallPhysicsEnabled,

    setExportRecording: (active) => director.setExportRecording(active),

    setImages: (nextImages) => {

      return preloadHoloContentTextures(scene, nextImages, holoRasterProfile, maxAnisotropy)

        .then((nextCache) => {

          mergeHoloCache(nextCache);

          director.reset();

          director.setImageUrls(nextImages.map((image) => image.url));

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
      attachBackdropMedia(element, nextCatalog);
    },

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
      holoRasterProfile.shapeId = nextCatalog.shapeId;
      holoRasterProfile.photoLayout = nextCatalog.photoLayout;
      director.setCatalog(nextCatalog);
      bindShowcaseCatalogColors(nextCatalog);

      const nextCache = await preloadHoloContentTextures(
        scene,
        nextImages,
        holoRasterProfile,
        maxAnisotropy
      );
      mergeHoloCache(nextCache);

      const urls = nextImages.map((image) => image.url);
      director.reset();
      director.setImageUrls(urls);
    },

    dispose: () => {

      window.removeEventListener("resize", onResize);

      scene.onBeforeRenderObservable.remove(observer);

      director.dispose();

      disposeHoloContentCache(holoContentCache);

      chapel.dispose();

      jewelLighting.dispose();

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

      scene.dispose();

      engine.dispose();

    },

  };

}


