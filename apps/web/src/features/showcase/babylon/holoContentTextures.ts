import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture";

import type { Scene } from "@babylonjs/core/scene";

import { resolveCubeFaceDisplayUrl, isTransparentMatteDataUrl } from "@mbox/shared";

import type { ProcessedImage } from "../../../shared/types";

import type { PhotoCrystalPhotoLayoutId, PhotoCrystalShapeId } from "./photoCrystalShapeCatalog";

import { createJewelPhotoTexture } from "./photoTextureRaster";

import type { JewelPhotoCropMeta, JewelPhotoTextureOptions } from "./jewelPhotoTextureTypes";

import { resolveJewelPhotoRasterCacheKey } from "./jewelPhotoRasterSpec";



export interface HoloContentTextures {

  composite: BaseTexture;

  background: BaseTexture;

  foreground: BaseTexture | null;

  hasDepthSplit: boolean;

}



export type HoloRasterProfile = {

  shapeId: PhotoCrystalShapeId;

  photoLayout: PhotoCrystalPhotoLayoutId;

};



function imageCacheKey(image: ProcessedImage, profile: HoloRasterProfile): string {

  return resolveJewelPhotoRasterCacheKey(image.url, profile.shapeId, profile.photoLayout);

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

  maxAnisotropy = 16

): Promise<Map<string, HoloContentTextures>> {

  const unique = new Map<string, ProcessedImage>();

  for (const image of images) {

    unique.set(imageCacheKey(image, profile), image);

  }



  const entries = await Promise.all(

    [...unique.entries()].map(async ([key, image]) => {

      const entry = await loadHoloContentEntry(scene, image, profile, maxAnisotropy);

      return [key, entry] as const;

    })

  );



  return new Map(entries);

}



export function resolveHoloContentCacheKey(

  sourceUrl: string,

  profile: HoloRasterProfile

): string {

  return resolveJewelPhotoRasterCacheKey(sourceUrl, profile.shapeId, profile.photoLayout);

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


