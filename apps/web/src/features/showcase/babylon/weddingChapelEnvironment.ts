import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";

import { Vector3 } from "@babylonjs/core/Maths/math.vector";

import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";

import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";

import { PointLight } from "@babylonjs/core/Lights/pointLight";

import { PhotoDome } from "@babylonjs/core/Helpers/photoDome";

import { EquiRectangularCubeTexture } from "@babylonjs/core/Materials/Textures/equiRectangularCubeTexture";

import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";

import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";

import type { Scene } from "@babylonjs/core/scene";

import { Scene as BabylonScene } from "@babylonjs/core/scene";

import type { Mesh } from "@babylonjs/core/Meshes/mesh";

import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture";

import { HOLOGRAM_DISPLAY_SPEC } from "@mbox/shared";



const CHAPEL_PANORAMA_SIZE = 2048;



function createSeededRandom(seed: number): () => number {

  let state = seed % 2147483646;

  if (state <= 0) {

    state += 2147483645;

  }

  return () => {

    state = (state * 16807) % 2147483647;

    return (state - 1) / 2147483646;

  };

}



/** Dark wedding holo booth — luminous subject, void surround. */

export function createHoloBoothPanoramaDataUrl(panoramaCanvasSize = CHAPEL_PANORAMA_SIZE): string {

  const width = panoramaCanvasSize;

  const height = Math.floor(panoramaCanvasSize / 2);

  const canvas = document.createElement("canvas");

  canvas.width = width;

  canvas.height = height;

  const ctx = canvas.getContext("2d");

  if (!ctx) {

    return "";

  }



  const rand = createSeededRandom(77);

  const grad = ctx.createLinearGradient(0, 0, 0, height);

  grad.addColorStop(0, "#06080f");

  grad.addColorStop(0.32, "#0c1018");

  grad.addColorStop(0.58, "#141c28");

  grad.addColorStop(0.78, "#1e2838");

  grad.addColorStop(1, "#2a3448");

  ctx.fillStyle = grad;

  ctx.fillRect(0, 0, width, height);



  const vignette = ctx.createRadialGradient(

    width * 0.5,

    height * 0.48,

    0,

    width * 0.5,

    height * 0.48,

    width * 0.58

  );

  vignette.addColorStop(0, "rgba(80, 120, 180, 0.08)");

  vignette.addColorStop(0.45, "rgba(20, 28, 40, 0.35)");

  vignette.addColorStop(1, "rgba(0, 0, 0, 0.72)");

  ctx.fillStyle = vignette;

  ctx.fillRect(0, 0, width, height);



  for (let i = 0; i < 22; i += 1) {

    const x = rand() * width;

    const y = height * 0.05 + rand() * height * 0.5;

    const radius = 12 + rand() * 48;

    const bokeh = ctx.createRadialGradient(x, y, 0, x, y, radius);

    bokeh.addColorStop(0, "rgba(180, 210, 255, 0.22)");

    bokeh.addColorStop(0.5, "rgba(100, 160, 220, 0.08)");

    bokeh.addColorStop(1, "rgba(255, 255, 255, 0)");

    ctx.fillStyle = bokeh;

    ctx.beginPath();

    ctx.arc(x, y, radius, 0, Math.PI * 2);

    ctx.fill();

  }



  return canvas.toDataURL("image/jpeg", 0.88);

}



/** Minimal dark studio map — crystal env reflections on void backgrounds. */
function createStudioReflectionPanoramaDataUrl(): string {
  const width = 512;
  const height = 256;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return "";
  }
  const grad = ctx.createLinearGradient(0, 0, 0, height);
  grad.addColorStop(0, "#1a2230");
  grad.addColorStop(0.45, "#080a10");
  grad.addColorStop(1, "#030305");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  const spots: [number, number, number][] = [
    [0.22, 0.28, 0.35],
    [0.78, 0.22, 0.28],
    [0.5, 0.12, 0.22],
    [0.35, 0.55, 0.18],
    [0.68, 0.48, 0.2],
  ];
  for (const [nx, ny, r] of spots) {
    const x = nx * width;
    const y = ny * height;
    const radius = r * width;
    const spot = ctx.createRadialGradient(x, y, 0, x, y, radius);
    spot.addColorStop(0, "rgba(220, 235, 255, 0.95)");
    spot.addColorStop(0.35, "rgba(140, 180, 230, 0.35)");
    spot.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = spot;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  return canvas.toDataURL("image/jpeg", 0.9);
}

export interface WeddingChapelEnvironment {
  ground: Mesh | null;
  dome: PhotoDome | null;
  backgroundPreset: ShowcaseBackgroundPreset;

  applyShellReflection: (material: PBRMaterial) => void;

  dispose: () => void;

}



/** L0 — dark holo booth environment (replaces warm brown chapel). */

export type ShowcaseBackgroundPreset = "booth" | "solid_black" | "soft_gray";

export async function createWeddingChapelEnvironment(
  scene: Scene,
  options?: {
    backgroundPreset?: ShowcaseBackgroundPreset;
    groundEnabled?: boolean;
    /** When a photo/video backdrop drives the scene, skip the booth dome. */
    skipPanorama?: boolean;
    panoramaCanvasSize?: number;
    envCubemapSize?: number;
    photoDomeResolution?: number;
  }
): Promise<WeddingChapelEnvironment> {

  const spec = HOLOGRAM_DISPLAY_SPEC;
  const backgroundPreset: ShowcaseBackgroundPreset = options?.backgroundPreset ?? "booth";
  const groundEnabled = options?.groundEnabled ?? true;
  const skipPanorama = options?.skipPanorama ?? false;
  const panoramaCanvasSize = options?.panoramaCanvasSize ?? CHAPEL_PANORAMA_SIZE;
  const envCubemapSize = options?.envCubemapSize ?? 512;
  const photoDomeResolution = options?.photoDomeResolution ?? 64;

  if (skipPanorama) {
    scene.clearColor = new Color4(0, 0, 0, 0);
    scene.fogMode = 0;
    scene.environmentTexture = null;
    scene.environmentIntensity = 0;
  } else if (backgroundPreset === "solid_black") {
    scene.clearColor = new Color4(0, 0, 0, 1);
  } else if (backgroundPreset === "soft_gray") {
    scene.clearColor = new Color4(0.12, 0.12, 0.14, 1);
  } else {
    scene.clearColor = new Color4(spec.clearColor.r, spec.clearColor.g, spec.clearColor.b, 1);
  }

  scene.fogMode = BabylonScene.FOGMODE_EXP2;

  scene.fogColor =
    backgroundPreset === "soft_gray"
      ? new Color3(0.18, 0.18, 0.2)
      : new Color3(spec.fogColor.r, spec.fogColor.g, spec.fogColor.b);

  scene.fogDensity = backgroundPreset === "solid_black" ? 0 : spec.fogDensity;



  scene.imageProcessingConfiguration.exposure = 1.08;

  scene.imageProcessingConfiguration.contrast = 1.1;

  scene.imageProcessingConfiguration.toneMappingEnabled = true;



  let dome: PhotoDome | null = null;
  let envTex: EquiRectangularCubeTexture | null = null;

  if (backgroundPreset === "booth" && !skipPanorama) {
    const panoramaUrl = createHoloBoothPanoramaDataUrl(panoramaCanvasSize);
    dome = new PhotoDome(
      "holo-booth-dome",
      panoramaUrl,
      { resolution: photoDomeResolution, size: 48 },
      scene
    );
    dome.mesh.isPickable = false;
    envTex = new EquiRectangularCubeTexture(panoramaUrl, scene, envCubemapSize, false, true);
    scene.environmentTexture = envTex;
    scene.environmentIntensity = spec.envIntensity;
  } else {
    const studioUrl = createStudioReflectionPanoramaDataUrl();
    if (studioUrl && !skipPanorama) {
      envTex = new EquiRectangularCubeTexture(
        studioUrl,
        scene,
        Math.min(envCubemapSize, 256),
        false,
        true
      );
      scene.environmentTexture = envTex;
    } else {
      scene.environmentTexture = null;
    }
    scene.environmentIntensity = backgroundPreset === "solid_black" ? 1.35 : 1.1;
  }



  const hemi = new HemisphericLight("holo-hemi", new Vector3(0.05, 1, 0.08), scene);

  hemi.diffuse = new Color3(0.82, 0.88, 1);

  hemi.groundColor = new Color3(0.12, 0.14, 0.18);

  hemi.intensity = 0.55;



  const key = new DirectionalLight("holo-key", new Vector3(-0.3, -1, 0.2), scene);

  key.position = new Vector3(3.5, 7, 4);

  key.diffuse = new Color3(0.9, 0.94, 1);

  key.intensity = 0.85;



  const fill = new DirectionalLight("holo-fill", new Vector3(0.45, -0.25, -0.35), scene);

  fill.diffuse = new Color3(0.75, 0.82, 0.95);

  fill.intensity = 0.32;



  const sparkle = new PointLight("holo-sparkle", new Vector3(0.6, 2.4, 2.8), scene);

  sparkle.diffuse = new Color3(0.92, 0.97, 1);

  sparkle.intensity = 1.65;

  sparkle.range = 16;



  const facetKey = new PointLight("holo-facet-key", new Vector3(-2.2, 1.6, 3.4), scene);

  facetKey.diffuse = new Color3(1, 0.98, 0.95);

  facetKey.intensity = 1.2;

  facetKey.range = 12;



  const facetFill = new PointLight("holo-facet-fill", new Vector3(2.4, 0.8, -2.6), scene);

  facetFill.diffuse = new Color3(0.75, 0.88, 1);

  facetFill.intensity = 0.55;

  facetFill.range = 11;



  let ground: Mesh | null = null;
  let floorMat: PBRMaterial | null = null;
  if (groundEnabled) {
    ground = MeshBuilder.CreateGround("holo-floor", { width: 22, height: 22 }, scene);
    floorMat = new PBRMaterial("holo-marble", scene);
    floorMat.albedoColor = new Color3(0.88, 0.9, 0.94);
    floorMat.metallic = 0.22;
    floorMat.roughness = 0.28;
    floorMat.environmentIntensity = 0.75;
    floorMat.clearCoat.isEnabled = true;
    floorMat.clearCoat.intensity = 0.22;
    ground.material = floorMat;
    ground.receiveShadows = true;
  }



  const applyShellReflection = (material: PBRMaterial) => {

    material.reflectionTexture = scene.environmentTexture as BaseTexture;

    material.environmentIntensity = 3.1;

  };



  return {

    ground,

    dome,

    backgroundPreset,

    applyShellReflection,

    dispose: () => {

      envTex?.dispose();
      floorMat?.dispose();
      ground?.dispose();
      dome?.dispose();

    },

  };

}

/** Opaque 3D booth clear — used when DOM video backdrop is off. */
export function applyShowcaseChapelOpaqueClear(
  scene: Scene,
  preset: ShowcaseBackgroundPreset = "booth"
): void {
  const spec = HOLOGRAM_DISPLAY_SPEC;
  if (preset === "solid_black") {
    scene.clearColor = new Color4(0, 0, 0, 1);
  } else if (preset === "soft_gray") {
    scene.clearColor = new Color4(0.12, 0.12, 0.14, 1);
  } else {
    scene.clearColor = new Color4(spec.clearColor.r, spec.clearColor.g, spec.clearColor.b, 1);
  }
  scene.fogMode = BabylonScene.FOGMODE_EXP2;
}


