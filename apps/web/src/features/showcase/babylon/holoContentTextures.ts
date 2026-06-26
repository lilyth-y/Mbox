import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture";

import type { Scene } from "@babylonjs/core/scene";

import { resolveCubeFaceDisplayUrl, isTransparentMatteDataUrl } from "@mbox/shared";

import type { ProcessedImage } from "../../../shared/types";

import type { PhotoCrystalPhotoLayoutId, PhotoCrystalShapeId } from "./photoCrystalShapeCatalog";

import { createJewelPhotoTexture } from "./photoTextureRaster";

import type { JewelPhotoCropMeta, JewelPhotoTextureOptions } from "./jewelPhotoTextureTypes";

import { resolveJewelPhotoRasterCacheKey } from "./jewelPhotoRasterSpec";
import { gpuSpreadFrameGap, waitGpuFrames } from "./showcaseGpuLoadScheduler";



export interface HoloContentTextures {

  composite: BaseTexture;

  background: BaseTexture;

  foreground: BaseTexture | null;

  hasDepthSplit: boolean;

}



export type HoloRasterProfile = {

  shapeId: PhotoCrystalShapeId;

  photoLayout: PhotoCrystalPhotoLayoutId;

  textureMaxEdge?: number;

  cubeTextureSize?: number;

};



function rasterBudget(profile: HoloRasterProfile) {
  return {
    textureMaxEdge: profile.textureMaxEdge,
    cubeTextureSize: profile.cubeTextureSize,
  };
}

function imageCacheKey(image: ProcessedImage, profile: HoloRasterProfile): string {

  return resolveJewelPhotoRasterCacheKey(
    image.url,
    profile.shapeId,
    profile.photoLayout,
    rasterBudget(profile)
  );

}



function cropMetaFromImage(image: ProcessedImage): JewelPhotoCropMeta {

  return {

    center: image.center,

    focus: image.focus,

    subjectBounds: image.subject?.bounds,

  };

}



function rasterOptions(

  profile: HoloRasterProfile,

  image: ProcessedImage,

  maxAnisotropy: number,

  preserveAlphaSource = false

): JewelPhotoTextureOptions {

  return {

    shapeId: profile.shapeId,

    photoLayout: profile.photoLayout,

    crop: cropMetaFromImage(image),

    maxAnisotropy,

    textureMaxEdge: profile.textureMaxEdge,

    cubeTextureSize: profile.cubeTextureSize,

    preserveAlphaSource,

  };

}



function resolveSharpRasterSource(image: ProcessedImage, displayUrl: string): string {

  const original = image.preCropSourceUrl ?? image.originalUrl ?? "";

  if (original && !isTransparentMatteDataUrl(original)) {

    return original;

  }

  return displayUrl;

}



async function loadHoloContentEntry(

  scene: Scene,

  image: ProcessedImage,

  profile: HoloRasterProfile,

  maxAnisotropy: number

): Promise<HoloContentTextures> {

  const displayUrl = resolveCubeFaceDisplayUrl(image);

  const rasterSource = resolveSharpRasterSource(image, displayUrl);

  const baseOpts = rasterOptions(profile, image, maxAnisotropy);



  const composite = await createJewelPhotoTexture(scene, rasterSource, baseOpts);

  return {
    composite,
    background: composite,
    foreground: null,
    hasDepthSplit: false,
  };

}



export async function preloadHoloContentTextures(

  scene: Scene,

  images: ProcessedImage[],

  profile: HoloRasterProfile,

  maxAnisotropy = 16,

  options?: { sequential?: boolean; immediateCount?: number }

): Promise<Map<string, HoloContentTextures>> {

  const unique = new Map<string, ProcessedImage>();

  for (const image of images) {

    unique.set(imageCacheKey(image, profile), image);

  }

  const entries = [...unique.entries()];
  const immediateCount = Math.max(1, options?.immediateCount ?? entries.length);
  const immediate = entries.slice(0, immediateCount);
  const deferred = entries.slice(immediateCount);

  const map = new Map<string, HoloContentTextures>();
  const gap = gpuSpreadFrameGap();
  const loadEntry = async ([key, image]: readonly [string, ProcessedImage]) => {
    const entry = await loadHoloContentEntry(scene, image, profile, maxAnisotropy);
    map.set(key, entry);
  };

  if (options?.sequential || deferred.length > 0) {
    for (const item of immediate) {
      await loadEntry(item);
      await waitGpuFrames(gap);
    }
    return map;
  }

  await Promise.all(immediate.map(loadEntry));
  return map;
}

/** Spread remaining photo textures across frames after first jewel is visible. */
export async function prefetchDeferredHoloContentTextures(
  scene: Scene,
  images: ProcessedImage[],
  profile: HoloRasterProfile,
  cache: Map<string, HoloContentTextures>,
  maxAnisotropy = 16,
  skipCount = 1
): Promise<void> {
  const unique = new Map<string, ProcessedImage>();
  for (const image of images) {
    unique.set(imageCacheKey(image, profile), image);
  }
  const entries = [...unique.entries()].slice(skipCount);
  const gap = gpuSpreadFrameGap();
  for (const [key, image] of entries) {
    if (cache.has(key)) {
      continue;
    }
    cache.set(key, await loadHoloContentEntry(scene, image, profile, maxAnisotropy));
    await waitGpuFrames(gap);
  }
}



export function resolveHoloContentCacheKey(

  sourceUrl: string,

  profile: HoloRasterProfile

): string {

  return resolveJewelPhotoRasterCacheKey(
    sourceUrl,
    profile.shapeId,
    profile.photoLayout,
    rasterBudget(profile)
  );

}



export function disposeHoloContentCache(cache: Map<string, HoloContentTextures>): void {

  const disposed = new Set<BaseTexture>();

  for (const entry of cache.values()) {

    for (const tex of [entry.composite, entry.background, entry.foreground]) {

      if (tex && !disposed.has(tex)) {

        tex.dispose();

        disposed.add(tex);

      }

    }

  }

  cache.clear();

}


