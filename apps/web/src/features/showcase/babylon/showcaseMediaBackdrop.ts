import type { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { VideoTexture } from "@babylonjs/core/Materials/Textures/videoTexture";
import { EquiRectangularCubeTexture } from "@babylonjs/core/Materials/Textures/equiRectangularCubeTexture";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";
import type { Engine } from "@babylonjs/core/Engines/engine";
import { Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import {
  isBackgroundVideoPath,
  resolveBackgroundAssetPublicUrl,
} from "../../../shared/lib/backgroundAssetCatalog";
import { setJewelCrystalShellEnv } from "./shaders/jewelCrystalShellShader";
import type { JewelCrystalShellMaterial } from "./shaders/jewelCrystalShellShader";
import { computeBackdropCoverTransform } from "./showcaseBackdropCover";
import {
  buildShowcaseEnvPanoramaDataUrl,
  sampleShowcaseBackdropColors,
} from "./showcaseBackdropSampler";
import { setShowcaseBackgroundLightingState } from "./showcaseBackgroundState";
import {
  applyCrystalHarmonyToScene,
  applyCrystalHarmonyToShell,
  classifyCrystalHarmonyProfile,
  computeCrystalHarmonyTuning,
} from "./showcaseCrystalHarmony";

const BACKDROP_DISTANCE = 72;
const SAMPLE_INTERVAL_MS = 480;
const ENV_REBUILD_MIN_MS = 2000;
const SAMPLE_WIDTH = 40;
const SAMPLE_HEIGHT = 40;
const ENV_MAP_SIZE = 512;

export type ShowcaseMediaBackdropOptions = {
  mediaPath: string;
  opacity?: number;
  lightInfluence?: number;
  /** Reuse the DOM preview element so export matches on-screen playback. */
  sourceElement?: HTMLVideoElement | HTMLImageElement | null;
  /** MP4 export: visible plane only, no harmony/env rebuild. */
  exportMode?: boolean;
};

export type ShowcaseMediaBackdropRig = {
  mesh: Mesh;
  material: StandardMaterial;
  tick: (dtMs: number, shellMaterial?: JewelCrystalShellMaterial | null) => void;
  resize: () => void;
  dispose: () => void;
};

function resolveShowcaseMediaUrl(mediaPath: string): string {
  const trimmed = mediaPath.trim();
  if (
    trimmed.startsWith("data:") ||
    trimmed.startsWith("blob:") ||
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://")
  ) {
    return trimmed;
  }
  return resolveBackgroundAssetPublicUrl(trimmed);
}

function fitBackdropPlane(camera: ArcRotateCamera, engine: Engine, distance: number): Vector3 {
  const vFov = camera.fov;
  const height = 2 * distance * Math.tan(vFov / 2);
  const aspect = engine.getRenderWidth() / Math.max(engine.getRenderHeight(), 1);
  const width = height * aspect;
  return new Vector3(width, height, 0);
}

function applyTextureCover(
  texture: Texture,
  mediaWidth: number,
  mediaHeight: number,
  viewAspect: number
): void {
  const mediaAspect = mediaWidth / Math.max(mediaHeight, 1);
  const cover = computeBackdropCoverTransform(mediaAspect, viewAspect);
  texture.uScale = cover.uScale;
  texture.vScale = cover.vScale;
  texture.uOffset = cover.uOffset;
  texture.vOffset = cover.vOffset;
  texture.wrapU = Texture.CLAMP_ADDRESSMODE;
  texture.wrapV = Texture.CLAMP_ADDRESSMODE;
}

function quantizeSampleKey(sample: ReturnType<typeof sampleShowcaseBackdropColors>): string {
  if (!sample) {
    return "";
  }
  const q = (value: number | undefined) =>
    Number.isFinite(value) ? (Math.round(value! * 10) / 10).toFixed(2) : "0.00";
  return [
    classifyCrystalHarmonyProfile(sample),
    q(sample.average.r),
    q(sample.average.g),
    q(sample.average.b),
    q(sample.luminance),
  ].join("|");
}

function configureLuxuryTextureQuality(texture: Texture, engine: Engine): void {
  texture.updateSamplingMode(Texture.TRILINEAR_SAMPLINGMODE);
  texture.anisotropicFilteringLevel = Math.min(4, engine.getCaps().maxAnisotropy ?? 4);
  texture.gammaSpace = true;
}

function loadVideoElement(url: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.src = url;
    video.loop = true;
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = "anonymous";
    video.preload = "auto";

    const onMeta = () => resolve(video);
    video.addEventListener("loadedmetadata", onMeta, { once: true });
    video.addEventListener("error", () => reject(new Error("배경 동영상을 불러올 수 없습니다.")), {
      once: true,
    });
    video.load();
  });
}

function loadImageElement(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("배경 이미지를 불러올 수 없습니다."));
    image.src = url;
  });
}

export async function createShowcaseMediaBackdrop(
  scene: Scene,
  camera: ArcRotateCamera,
  engine: Engine,
  options: ShowcaseMediaBackdropOptions
): Promise<ShowcaseMediaBackdropRig> {
  const exportMode = options.exportMode === true;
  const opacity = Math.max(0.2, Math.min(1, options.opacity ?? 1));
  const influence = Math.max(0, Math.min(1, options.lightInfluence ?? 0.78));
  const url = resolveShowcaseMediaUrl(options.mediaPath);
  const isVideo = isBackgroundVideoPath(options.mediaPath);
  const sourceElement = options.sourceElement ?? null;

  let sampleSource: CanvasImageSource | null = null;
  let texture: Texture;
  let video: HTMLVideoElement | null = null;
  let ownsVideo = false;
  let mediaWidth = 16;
  let mediaHeight = 9;

  if (sourceElement instanceof HTMLVideoElement) {
    video = sourceElement;
    mediaWidth = video.videoWidth || 3840;
    mediaHeight = video.videoHeight || 2160;
    sampleSource = exportMode ? null : video;
    texture = new VideoTexture(`showcase-bg-video-${Date.now()}`, video, scene, false, true);
    void video.play().catch(() => undefined);
  } else if (sourceElement instanceof HTMLImageElement) {
    mediaWidth = sourceElement.naturalWidth || 1920;
    mediaHeight = sourceElement.naturalHeight || 1080;
    sampleSource = exportMode ? null : sourceElement;
    texture = new Texture(sourceElement.src, scene, false, true, Texture.TRILINEAR_SAMPLINGMODE);
  } else if (isVideo) {
    video = await loadVideoElement(url);
    ownsVideo = true;
    mediaWidth = video.videoWidth || 3840;
    mediaHeight = video.videoHeight || 2160;
    sampleSource = exportMode ? null : video;
    texture = new VideoTexture(`showcase-bg-video-${Date.now()}`, video, scene, false, true);
    void video.play().catch(() => undefined);
  } else {
    const image = await loadImageElement(url);
    mediaWidth = image.naturalWidth || 1920;
    mediaHeight = image.naturalHeight || 1080;
    sampleSource = exportMode ? null : image;
    texture = new Texture(url, scene, false, true, Texture.TRILINEAR_SAMPLINGMODE);
  }

  configureLuxuryTextureQuality(texture, engine);

  const mesh = MeshBuilder.CreatePlane("showcase-media-backdrop", { width: 1, height: 1 }, scene);
  mesh.parent = camera;
  mesh.position = new Vector3(0, 0, BACKDROP_DISTANCE);
  mesh.renderingGroupId = 0;
  mesh.isPickable = false;
  mesh.infiniteDistance = true;

  const material = new StandardMaterial("showcase-media-backdrop-mat", scene);
  material.emissiveTexture = texture;
  material.disableLighting = true;
  material.backFaceCulling = false;
  material.alpha = opacity;
  material.transparencyMode = opacity < 0.999 ? 2 : 0;
  mesh.material = material;

  const resize = () => {
    const size = fitBackdropPlane(camera, engine, BACKDROP_DISTANCE);
    mesh.scaling.set(size.x, size.y, 1);
    const viewAspect = engine.getRenderWidth() / Math.max(engine.getRenderHeight(), 1);
    applyTextureCover(texture, mediaWidth, mediaHeight, viewAspect);
  };
  resize();

  let envTex: EquiRectangularCubeTexture | null = null;
  let sampleElapsed = SAMPLE_INTERVAL_MS;
  let lastEnvKey = "";
  let lastEnvRebuildMs = 0;

  setShowcaseBackgroundLightingState({ influence, mediaActive: !exportMode, glowMul: 1 });

  if (exportMode) {
    scene.clearColor = new Color4(0, 0, 0, 0);
  }

  const applySampleToScene = (shellMaterial?: JewelCrystalShellMaterial | null) => {
    if (exportMode || !sampleSource) {
      return;
    }
    if (video && video.readyState < 2) {
      return;
    }

    let sample: ReturnType<typeof sampleShowcaseBackdropColors>;
    try {
      sample = sampleShowcaseBackdropColors(sampleSource, SAMPLE_WIDTH, SAMPLE_HEIGHT);
    } catch {
      return;
    }
    if (!sample) {
      return;
    }

    let tuning: ReturnType<typeof computeCrystalHarmonyTuning>;
    try {
      tuning = computeCrystalHarmonyTuning(sample, influence);
    } catch {
      return;
    }
    setShowcaseBackgroundLightingState({
      sample,
      influence,
      mediaActive: true,
      glowMul: tuning.glowMul,
    });

    scene.clearColor = new Color4(
      sample.average.r * 0.08,
      sample.average.g * 0.08,
      sample.average.b * 0.1,
      1
    );
    applyCrystalHarmonyToScene(scene, tuning);
    if (shellMaterial) {
      applyCrystalHarmonyToShell(shellMaterial, tuning, 1);
    }

    const envKey = quantizeSampleKey(sample);
    const now = performance.now();
    const shouldRebuildEnv =
      envKey !== lastEnvKey && (now - lastEnvRebuildMs >= ENV_REBUILD_MIN_MS || !envTex);
    if (!shouldRebuildEnv) {
      if (envTex && shellMaterial) {
        setJewelCrystalShellEnv(shellMaterial, envTex);
      }
      return;
    }

    const envUrl = buildShowcaseEnvPanoramaDataUrl(sample, ENV_MAP_SIZE);
    if (!envUrl) {
      return;
    }

    lastEnvKey = envKey;
    lastEnvRebuildMs = now;
    envTex?.dispose();
    envTex = new EquiRectangularCubeTexture(envUrl, scene, ENV_MAP_SIZE, false, true);
    scene.environmentTexture = envTex;
    if (shellMaterial) {
      setJewelCrystalShellEnv(shellMaterial, envTex);
    }
  };

  const tick = (dtMs: number, shellMaterial?: JewelCrystalShellMaterial | null) => {
    if (exportMode) {
      return;
    }
    sampleElapsed += dtMs;
    if (sampleElapsed >= SAMPLE_INTERVAL_MS) {
      sampleElapsed = 0;
      applySampleToScene(shellMaterial);
    }
  };

  const dispose = () => {
    if (!exportMode) {
      setShowcaseBackgroundLightingState({ sample: null, mediaActive: false, glowMul: 1 });
    }
    envTex?.dispose();
    texture.dispose();
    material.dispose();
    mesh.dispose();
    if (video && ownsVideo) {
      video.pause();
      video.removeAttribute("src");
      video.load();
    }
  };

  if (!exportMode) {
    window.setTimeout(() => applySampleToScene(), 160);
  }

  return { mesh, material, tick, resize, dispose };
}
