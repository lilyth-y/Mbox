import type { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";

import type { Scene } from "@babylonjs/core/scene";

import type { JewelCubePhysicsRig } from "../babylon/jewelCubeFactory";

import { startJewelPhotoMorph } from "../babylon/jewelCubePhotoMorph";
import { getJewelCubeYawRadians, setJewelCubeYaw } from "./physicsHelpers";

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
import {
  DEFAULT_SHOWCASE_PRESENTATION_PREFERENCES,
  type ShowcasePresentationPreferences,
  clampZoomBreathingAmplitude,
  clampZoomBreathingPeriodMs,
  normalizeVariableSpinMode,
} from "./showcasePresentationPreferences";
import { DEFAULT_SHOWCASE_CATALOG } from "../showcaseCatalogOptions";



export interface ShowcasePipelineDirector {

  stageId: ShowcasePipelineStageId;

  imageIndex: number;

  playing: boolean;

  totalElapsedMs: number;

  setPlaying: (playing: boolean) => void;

  setPresentationPreferences: (prefs: ShowcasePresentationPreferences) => void;

  getPresentationPreferences: () => ShowcasePresentationPreferences;

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
  config?: ShowcasePipelineConfig;
  catalog?: ShowcaseCatalogOptions;
  presentationPrefs?: ShowcasePresentationPreferences;
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

  let presentationPrefs =
    options.presentationPrefs ?? DEFAULT_SHOWCASE_PRESENTATION_PREFERENCES;

  let exportRecording = false;

  let stageOrder = options.stageOrder ?? resolveActiveShowcasePipeline();

  let stages: ShowcasePipelineStage[] = resolveShowcasePipelineStages(stageOrder);



  const state = {

    urls: imageUrls.slice(),

    imageIndex: 0,

    rig: null as JewelCubePhysicsRig | null,

    phaseElapsedMs: 0,
    totalElapsedMs: 0,
    spinSign: 1 as 1 | -1,
    spinOmegaY: 0,
    presentationCycle: 0,
    spinDirection: "left" as const,

    stageState: {} as Record<string, unknown>,

    stageIndex: 0,

    playing: false,

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

    get spinOmegaY() {

      return state.spinOmegaY;

    },

    set spinOmegaY(value) {

      state.spinOmegaY = value;

    },

    get presentationCycle() {

      return state.presentationCycle;

    },

    set presentationCycle(value) {

      state.presentationCycle = value;

    },

    get presentationPrefs() {

      return presentationPrefs;

    },

    get spinDirection() {

      return state.spinDirection;

    },

    set spinDirection(value) {

      state.spinDirection = value;

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



  enterStage(0);



  const advanceStage = () => {

    const completedId = stages[state.stageIndex]!.id;

    stages[state.stageIndex]?.exit?.(ctx);

    if (completedId === "ascend") {

      state.presentationCycle += 1;

    }

    let nextIndex = (state.stageIndex + 1) % stages.length;

    if (
      stages[nextIndex]!.id === "reveal" &&
      state.rig &&
      state.presentationCycle > 0
    ) {

      nextIndex = (nextIndex + 1) % stages.length;

    }

    enterStage(nextIndex);

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

    get totalElapsedMs() {

      return state.totalElapsedMs;

    },

    setPlaying(value: boolean) {

      state.playing = value;

    },

    setPresentationPreferences(prefs: ShowcasePresentationPreferences) {

      const disablingVariable =
        presentationPrefs.variableSpinEnabled && !prefs.variableSpinEnabled;

      presentationPrefs = {
        ...prefs,
        variableSpinMode: normalizeVariableSpinMode(prefs.variableSpinMode),
        zoomBreathingPeriodMs: clampZoomBreathingPeriodMs(prefs.zoomBreathingPeriodMs),
        zoomBreathingAmplitude: clampZoomBreathingAmplitude(prefs.zoomBreathingAmplitude),
      };

      if (disablingVariable) {

        state.spinDirection = "left";

        state.spinSign = state.spinOmegaY >= 0 ? 1 : -1;

        if (state.rig) {

          setJewelCubeYaw(state.rig, getJewelCubeYawRadians(state.rig));

        }

      }

    },

    getPresentationPreferences: () => ({ ...presentationPrefs }),

    setImageUrls(next: string[]) {

      state.urls = next.slice();

      state.imageIndex = 0;

      state.presentationCycle = 0;

      state.totalElapsedMs = 0;

      state.spinOmegaY = 0;

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

      state.spinOmegaY = 0;

      state.presentationCycle = 0;

      state.stageState.jewelSpawnGeneration =
        ((state.stageState.jewelSpawnGeneration as number | undefined) ?? 0) + 1;

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


