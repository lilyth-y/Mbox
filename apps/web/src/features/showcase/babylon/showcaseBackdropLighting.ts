import type { Scene } from "@babylonjs/core/scene";

import { Color4 } from "@babylonjs/core/Maths/math.color";

import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture";

import {

  setJewelCrystalShellEnvMaps,

} from "./shaders/jewelCrystalShellShader";

import type { JewelCrystalShellMaterial } from "./shaders/jewelCrystalShellShader";

import {

  buildShowcaseEnvPanoramaDataUrl,

  sampleShowcaseBackdropColors,

  type ShowcaseBackdropSample,

} from "./showcaseBackdropSampler";

import { setShowcaseBackgroundLightingState } from "./showcaseBackgroundState";

import {

  resetShowcaseHarmonyState,

  setStaticBackdropHarmonySample,

  getSmoothedBackdropSample,

  getCurrentHarmonyTuning,

} from "./showcaseHarmonyState";

import { applyCrystalHarmonyToScene } from "./showcaseCrystalHarmony";

import {

  applyCrystalMediaReflectionStrength,

  applyUserCrystalSurfaceColor,

} from "./showcaseCrystalColor";

import { createShowcaseMediaEnvTextures } from "./showcaseMediaEnvCapture";



const SAMPLE_WIDTH = 40;

const SAMPLE_HEIGHT = 40;

const ENV_MAP_SIZE = 512;

const LIVE_FREEZE_RETRY_MS = 120;

const LIVE_FREEZE_MAX_ATTEMPTS = 40;



export type ShowcaseBackdropLightingOptions = {

  /** Live video/image — sampled once, then frozen (no per-frame env rebuild). */

  source?: CanvasImageSource;

  /** Solid preset colors — stable harmony without flicker. */

  staticSample?: ShowcaseBackdropSample;

  influence: number;

};



export type ShowcaseBackdropLightingRig = {

  tick: (

    dtMs: number,

    shellMaterial?: JewelCrystalShellMaterial | null,

    innerShellMaterial?: JewelCrystalShellMaterial | null

  ) => void;

  dispose: () => void;

};



function bindShellEnvMaps(

  shellMaterial: JewelCrystalShellMaterial | null | undefined,

  envCapture: ReturnType<typeof createShowcaseMediaEnvTextures>,

  innerShellMaterial?: JewelCrystalShellMaterial | null,

  lastBound?: { color: BaseTexture | null; media: BaseTexture | null }

): { color: BaseTexture | null; media: BaseTexture | null } {

  const colorEnv = envCapture.getColorEnv();

  const mediaEnv = envCapture.getMediaEnv();

  const next = { color: colorEnv, media: mediaEnv };



  if (

    lastBound &&

    lastBound.color === next.color &&

    lastBound.media === next.media

  ) {

    return lastBound;

  }



  if (shellMaterial && typeof (shellMaterial as any).setVector3 === "function") {

    try {
      setJewelCrystalShellEnvMaps(shellMaterial, colorEnv, mediaEnv);
    } catch {
      // Some sessions can temporarily expose a lite shell material placeholder.
      // Keep the preview running; env maps will be rebound after upgrade.
    }

    applyUserCrystalSurfaceColor(shellMaterial);
    applyCrystalMediaReflectionStrength(shellMaterial);

  }

  if (innerShellMaterial && typeof (innerShellMaterial as any).setVector3 === "function") {

    try {
      setJewelCrystalShellEnvMaps(innerShellMaterial, colorEnv, mediaEnv);
    } catch {
      // ignore
    }

  }

  return next;

}



function readLiveBackdropSample(

  source: CanvasImageSource

): ShowcaseBackdropSample | null {

  if (source instanceof HTMLVideoElement && source.readyState < 2) {

    return null;

  }

  return sampleShowcaseBackdropColors(source, SAMPLE_WIDTH, SAMPLE_HEIGHT);

}



export function createShowcaseBackdropLighting(

  scene: Scene,

  options: ShowcaseBackdropLightingOptions

): ShowcaseBackdropLightingRig {

  const influence = Math.max(0, Math.min(1, options.influence));

  const envCapture = createShowcaseMediaEnvTextures(scene);

  let lastBoundEnv: { color: BaseTexture | null; media: BaseTexture | null } = {

    color: null,

    media: null,

  };

  const isStatic = Boolean(options.staticSample);

  const hasLiveMedia = Boolean(options.source) && !isStatic;

  let lightingFrozen = isStatic;



  resetShowcaseHarmonyState();



  const syncBackgroundState = () => {

    const sample = getSmoothedBackdropSample();

    const tuning = getCurrentHarmonyTuning();

    setShowcaseBackgroundLightingState({

      sample,

      influence,

      mediaActive: true,

      glowMul: tuning?.glowMul ?? 1,

    });

  };



  const applyFrozenEnvMaps = (

    sample: ShowcaseBackdropSample,

    shellMaterial?: JewelCrystalShellMaterial | null,

    innerShellMaterial?: JewelCrystalShellMaterial | null

  ) => {

    const envUrl = buildShowcaseEnvPanoramaDataUrl(sample, ENV_MAP_SIZE);

    if (!envUrl) {

      return;

    }

    envCapture.setColorEnvFromUrl(envUrl, true);

    lastBoundEnv = bindShellEnvMaps(shellMaterial, envCapture, innerShellMaterial, lastBoundEnv);

  };



  const freezeLighting = (

    sample: ShowcaseBackdropSample,

    shellMaterial?: JewelCrystalShellMaterial | null,

    innerShellMaterial?: JewelCrystalShellMaterial | null

  ) => {

    if (lightingFrozen) {

      return;

    }

    setStaticBackdropHarmonySample(sample, influence);

    syncBackgroundState();

    applyFrozenEnvMaps(sample, shellMaterial, innerShellMaterial);

    const tuning = getCurrentHarmonyTuning();

    if (tuning) {

      applyCrystalHarmonyToScene(scene, tuning, 1);

    }

    lightingFrozen = true;

  };



  if (options.staticSample) {

    freezeLighting(options.staticSample);

  }



  let freezeTimer: number | null = null;

  let freezeAttempts = 0;



  const scheduleLiveFreeze = (

    shellMaterial?: JewelCrystalShellMaterial | null,

    innerShellMaterial?: JewelCrystalShellMaterial | null

  ) => {

    if (!hasLiveMedia || !options.source || lightingFrozen) {

      return;

    }



    const attempt = () => {

      if (lightingFrozen) {

        return;

      }

      const sample = readLiveBackdropSample(options.source!);

      if (sample) {

        freezeLighting(sample, shellMaterial, innerShellMaterial);

        return;

      }

      freezeAttempts += 1;

      if (freezeAttempts < LIVE_FREEZE_MAX_ATTEMPTS) {

        freezeTimer = window.setTimeout(attempt, LIVE_FREEZE_RETRY_MS);

      }

    };



    freezeTimer = window.setTimeout(attempt, LIVE_FREEZE_RETRY_MS);

  };



  scheduleLiveFreeze();



  const tick = (

    _dtMs: number,

    shellMaterial?: JewelCrystalShellMaterial | null,

    innerShellMaterial?: JewelCrystalShellMaterial | null

  ) => {

    if (lightingFrozen) {

      if (shellMaterial || innerShellMaterial) {

        lastBoundEnv = bindShellEnvMaps(

          shellMaterial,

          envCapture,

          innerShellMaterial,

          lastBoundEnv

        );

      }

      return;

    }



    if (hasLiveMedia && options.source) {

      const sample = readLiveBackdropSample(options.source);

      if (sample) {

        freezeLighting(sample, shellMaterial, innerShellMaterial);

      }

    }

  };



  const dispose = () => {

    if (freezeTimer !== null) {

      window.clearTimeout(freezeTimer);

    }

    setShowcaseBackgroundLightingState({ sample: null, mediaActive: false, glowMul: 1 });

    resetShowcaseHarmonyState();

    envCapture.dispose();

  };



  return { tick, dispose };

}



export function applyShowcaseDomBackdropSceneDefaults(scene: Scene): void {

  scene.clearColor = new Color4(0, 0, 0, 0);

  scene.fogMode = 0;

}

