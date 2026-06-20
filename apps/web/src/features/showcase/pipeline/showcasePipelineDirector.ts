import type { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";

import type { Scene } from "@babylonjs/core/scene";

import type { JewelCubePhysicsRig } from "../babylon/jewelCubeFactory";

import { startJewelPhotoMorph } from "../babylon/jewelCubePhotoMorph";

import { resolveActiveShowcasePipeline } from "./pipelineOrder";

import {

  DEFAULT_SHOWCASE_PIPELINE_CONFIG,

  type ShowcasePipelineConfig,

  type ShowcasePipelineSnapshot,

  type ShowcasePipelineStageId,

  type ShowcaseSceneRuntime,

  type ShowcaseStageContext,

} from "./types";

import type { ShowcasePipelineStage } from "./types";
import { resolveShowcasePipelineStages } from "./stages";
import {
  buildShowcaseContentManifest,
  getShowcaseStageVersion,
  type ShowcaseContentManifest,
} from "./showcaseStageVersions";

import type { ShowcaseCatalogOptions } from "../showcaseCatalogOptions";
import { DEFAULT_SHOWCASE_CATALOG } from "../showcaseCatalogOptions";



export interface ShowcasePipelineDirector {

  stageId: ShowcasePipelineStageId;

  imageIndex: number;

  playing: boolean;

  fallPhysicsEnabled: boolean;

  totalElapsedMs: number;

  setPlaying: (playing: boolean) => void;

  setFallPhysicsEnabled: (enabled: boolean) => void;

  setImageUrls: (urls: string[]) => void;

  setCatalog: (catalog: ShowcaseCatalogOptions) => void;

  setExportRecording: (active: boolean) => void;

  getExportRecording: () => boolean;

  getRig: () => JewelCubePhysicsRig | null;

  getSnapshot: () => ShowcasePipelineSnapshot;

  getContentManifest: () => ShowcaseContentManifest;

  tick: (dtMs: number) => void;

  reset: () => void;

  dispose: () => void;

}



export interface ShowcasePipelineDirectorOptions {
  stageOrder?: ShowcasePipelineStageId[];
  fallPhysicsEnabled?: boolean;
  config?: ShowcasePipelineConfig;
  catalog?: ShowcaseCatalogOptions;
  runtime: ShowcaseSceneRuntime;
}



export function createShowcasePipelineDirector(

  scene: Scene,

  camera: ArcRotateCamera,

  imageUrls: string[],

  options: ShowcasePipelineDirectorOptions

): ShowcasePipelineDirector {

  const config = options.config ?? DEFAULT_SHOWCASE_PIPELINE_CONFIG;
  let catalog = options.catalog ?? DEFAULT_SHOWCASE_CATALOG;
  const runtime = options.runtime;

  let fallPhysicsEnabled = options.fallPhysicsEnabled ?? true;

  let exportRecording = false;

  let stageOrder =

    options.stageOrder ?? resolveActiveShowcasePipeline(fallPhysicsEnabled);

  let stages: ShowcasePipelineStage[] = resolveShowcasePipelineStages(stageOrder);



  const state = {

    urls: imageUrls.slice(),

    imageIndex: 0,

    rig: null as JewelCubePhysicsRig | null,

    phaseElapsedMs: 0,
    totalElapsedMs: 0,
    spinSign: 1 as 1 | -1,

    stageState: {} as Record<string, unknown>,

    stageIndex: 0,

    playing: true,

  };



  const ctx: ShowcaseStageContext = {

    scene,

    camera,

    config,

    get catalog() {
      return catalog;
    },

    runtime,

    get rig() {

      return state.rig;

    },

    set rig(value) {

      state.rig = value;

    },

    get imageUrls() {

      return state.urls;

    },

    get imageIndex() {

      return state.imageIndex;

    },

    set imageIndex(value) {

      state.imageIndex = value;

    },

    get phaseElapsedMs() {

      return state.phaseElapsedMs;

    },

    set phaseElapsedMs(value) {

      state.phaseElapsedMs = value;

    },

    get totalElapsedMs() {

      return state.totalElapsedMs;

    },

    get spinSign() {

      return state.spinSign;

    },

    set spinSign(value) {

      state.spinSign = value;

    },

    get stageState() {

      return state.stageState;

    },

    set stageState(value) {

      state.stageState = value;

    },

    get stageId() {

      return stages[state.stageIndex]!.id;

    },

    get exportRecording() {

      return exportRecording;

    },

  };



  const enterStage = (index: number) => {

    state.stageIndex = index;

    state.phaseElapsedMs = 0;

    state.stageState = {};

    stages[state.stageIndex]?.enter(ctx);

  };



  const applyStageOrder = (nextOrder: ShowcasePipelineStageId[]) => {

    stages[state.stageIndex]?.exit?.(ctx);

    stageOrder = nextOrder.slice();

    stages = resolveShowcasePipelineStages(stageOrder);

    enterStage(0);

  };



  enterStage(0);



  const advanceStage = () => {

    stages[state.stageIndex]?.exit?.(ctx);

    enterStage((state.stageIndex + 1) % stages.length);

  };



  const tick = (dtMs: number) => {

    if (!state.playing || state.urls.length === 0 || stages.length === 0) {

      return;

    }



    state.phaseElapsedMs += dtMs;
    state.totalElapsedMs += dtMs;

    const current = stages[state.stageIndex];

    if (!current) {

      return;

    }



    if (current.tick(ctx, dtMs) === "complete") {

      advanceStage();

    }

  };



  return {

    get stageId() {

      return stages[state.stageIndex]!.id;

    },

    get imageIndex() {

      return state.imageIndex;

    },

    get playing() {

      return state.playing;

    },

    get fallPhysicsEnabled() {

      return fallPhysicsEnabled;

    },

    get totalElapsedMs() {

      return state.totalElapsedMs;

    },

    setPlaying(value: boolean) {

      state.playing = value;

    },

    setFallPhysicsEnabled(enabled: boolean) {

      if (enabled === fallPhysicsEnabled) {

        return;

      }

      fallPhysicsEnabled = enabled;

      applyStageOrder(resolveActiveShowcasePipeline(enabled));

    },

    setImageUrls(next: string[]) {

      state.urls = next.slice();

      state.imageIndex = 0;

      if (state.rig && state.urls.length > 0) {

        const holo = runtime.getHoloContent(state.urls[0]!);

        startJewelPhotoMorph(state.rig, holo, 0, state.rig.photoMorph);

      } else if (state.rig) {

        state.rig.dispose();

        state.rig = null;

      }

      enterStage(0);

    },

    setCatalog(next: ShowcaseCatalogOptions) {

      catalog = next;

    },

    setExportRecording(active: boolean) {

      exportRecording = active;

    },

    getExportRecording: () => exportRecording,

    getRig: () => state.rig,

    getSnapshot: () => ({

      stageId: stages[state.stageIndex]!.id,

      stageIndex: state.stageIndex,

      imageIndex: state.imageIndex,

      phaseElapsedMs: state.phaseElapsedMs,

      stageVersion: getShowcaseStageVersion(stages[state.stageIndex]!.id).version,

      stageMaturity: getShowcaseStageVersion(stages[state.stageIndex]!.id).maturity,

    }),

    getContentManifest: () =>
      buildShowcaseContentManifest(
        stages.map((s) => s.id),
        undefined
      ),

    tick,

    reset() {

      state.imageIndex = 0;

      if (state.rig) {

        state.rig.dispose();

        state.rig = null;

      }

      state.totalElapsedMs = 0;
      enterStage(0);
    },

    dispose() {

      if (state.rig) {

        state.rig.dispose();

        state.rig = null;

      }

    },

  };

}


