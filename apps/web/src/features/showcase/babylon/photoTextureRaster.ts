import { Texture } from "@babylonjs/core/Materials/Textures/texture";

import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";

import type { Scene } from "@babylonjs/core/scene";

import { isTransparentMatteDataUrl } from "@mbox/shared";

import { isLocalhostInteractivePreview } from "../../../shared/lib/gpuSession";

import {

  drawImageCoverToRect,

  drawImageCoverToSquare,

  drawImageToPlateSquare,

} from "../../../shared/lib/backgroundPlate";

import type { ImageCenter, ImageFocus, SubjectBounds } from "../../../shared/types";

import { createShowcaseDemoDataUrl } from "../showcaseDemoImages";

import type { PhotoCrystalShapeId } from "./photoCrystalShapeCatalog";

import {

  JEWEL_PHOTO_CUBE_TEXTURE_SIZE,

  JEWEL_PHOTO_TEXTURE_MAX_EDGE,

  resolveJewelPhotoRasterSpec,

} from "./jewelPhotoRasterSpec";

import { getPhotoCrystalPhotoProfile } from "./photoCrystalPhotoProfile";

import {

  appendJewelSilhouettePath,

  shouldBakeSilhouetteClip,

} from "./jewelSilhouetteClip";

import {

  peekJewelPhotoBitmap,

  resolveJewelPhotoBitmapCacheKey,

  storeJewelPhotoBitmap,

} from "./jewelPhotoBitmapCache";

import type { JewelPhotoTextureOptions } from "./jewelPhotoTextureTypes";



export { JEWEL_PHOTO_CUBE_TEXTURE_SIZE as JEWEL_PHOTO_TEXTURE_SIZE };

export { JEWEL_PHOTO_TEXTURE_MAX_EDGE } from "./jewelPhotoRasterSpec";

export type { JewelPhotoCropMeta, JewelPhotoTextureOptions } from "./jewelPhotoTextureTypes";



function loadImageElement(url: string, timeoutMs?: number): Promise<HTMLImageElement> {
  const effectiveTimeoutMs =
    timeoutMs ??
    (url.startsWith("data:") || url.startsWith("blob:") ? 30_000 : 12_000);

  return new Promise((resolve, reject) => {

    const image = new Image();

    const timer = window.setTimeout(() => {

      reject(new Error(`[showcase] photo load timeout: ${url.slice(0, 96)}`));

    }, effectiveTimeoutMs);

    if (!url.startsWith("data:") && !url.startsWith("blob:")) {

      image.crossOrigin = "anonymous";

    }

    image.onload = () => {

      window.clearTimeout(timer);

      void (async () => {

        if (typeof image.decode === "function") {

          try {

            await image.decode();

          } catch {

            /* onload dimensions still valid */

          }

        }

        if (!image.naturalWidth || !image.naturalHeight) {
          reject(new Error(`[showcase] photo load empty: ${url.slice(0, 96)}`));
          return;
        }

        resolve(image);

      })();

    };

    image.onerror = () => {

      window.clearTimeout(timer);

      reject(new Error(`[showcase] photo load failed: ${url.slice(0, 96)}`));

    };

    image.src = url;

  });

}



export function configureJewelPhotoTexture(texture: Texture, maxAnisotropy = 16): void {

  texture.gammaSpace = true;

  texture.wrapU = Texture.CLAMP_ADDRESSMODE;

  texture.wrapV = Texture.CLAMP_ADDRESSMODE;

  texture.anisotropicFilteringLevel = maxAnisotropy;

  texture.updateSamplingMode(Texture.TRILINEAR_SAMPLINGMODE);

}



function resolveRasterOptions(

  options: JewelPhotoTextureOptions | number | undefined

): JewelPhotoTextureOptions {

  if (typeof options === "number") {

    return { maxAnisotropy: options };

  }

  return options ?? {};

}



function textureNameFromUrl(url: string): string {

  let hash = 0;

  for (let i = 0; i < url.length; i++) {

    hash = (hash * 31 + url.charCodeAt(i)) | 0;

  }

  return `jewelPhoto-${(hash >>> 0).toString(36)}`;

}



function createRasterCanvas(

  width: number,

  height: number

): OffscreenCanvas | HTMLCanvasElement {

  if (typeof OffscreenCanvas !== "undefined") {

    return new OffscreenCanvas(width, height);

  }

  const canvas = document.createElement("canvas");

  canvas.width = width;

  canvas.height = height;

  return canvas;

}



function drawJewelPhotoToContext(

  ctx: CanvasRenderingContext2D,

  image: HTMLImageElement,

  outWidth: number,

  outHeight: number,

  spec: ReturnType<typeof resolveJewelPhotoRasterSpec>,

  shapeId: PhotoCrystalShapeId,

  resolved: JewelPhotoTextureOptions,

  center?: ImageCenter,

  focus?: ImageFocus,

  subjectBounds?: SubjectBounds

): void {

  const profile = getPhotoCrystalPhotoProfile(shapeId);

  const clipSpec = {

    kind: profile.silhouette,

    polygonSides: profile.polygonSides,

    shapeId,

  };

  const bakeClip = shouldBakeSilhouetteClip(clipSpec, {

    preCropped: spec.preCroppedToPlate,

    preserveAlpha: Boolean(resolved.preserveAlphaSource),

  });



  ctx.clearRect(0, 0, outWidth, outHeight);

  if (bakeClip) {

    ctx.save();

    ctx.beginPath();

    appendJewelSilhouettePath(ctx, outWidth, outHeight, clipSpec);

    ctx.clip();

  }



  if (resolved.preserveAlphaSource) {

    if (center && typeof center.x === "number") {

      drawImageToPlateSquare(ctx, image, outWidth, center, focus, subjectBounds);

    } else {

      drawImageCoverToSquare(ctx, image, outWidth);

    }

  } else if (spec.layout === "cube") {

    if (center && typeof center.x === "number") {

      drawImageToPlateSquare(ctx, image, outWidth, center, focus, subjectBounds);

    } else {

      drawImageCoverToSquare(ctx, image, outWidth);

    }

  } else {

    drawImageCoverToRect(ctx, image, outWidth, outHeight, center, focus, subjectBounds);

  }



  if (bakeClip) {

    ctx.restore();

  }

}



async function rasterJewelPhotoBitmap(

  image: HTMLImageElement,

  outWidth: number,

  outHeight: number,

  spec: ReturnType<typeof resolveJewelPhotoRasterSpec>,

  shapeId: PhotoCrystalShapeId,

  resolved: JewelPhotoTextureOptions,

  center?: ImageCenter,

  focus?: ImageFocus,

  subjectBounds?: SubjectBounds

): Promise<ImageBitmap> {

  const canvas = createRasterCanvas(outWidth, outHeight);

  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;

  if (!ctx) {

    throw new Error("[showcase] canvas 2d unavailable");

  }

  drawJewelPhotoToContext(

    ctx,

    image,

    outWidth,

    outHeight,

    spec,

    shapeId,

    resolved,

    center,

    focus,

    subjectBounds

  );

  return createImageBitmap(canvas);

}



/**

 * Rasterize from the original (large) photo — shape plate aspect for portrait, square for cube.

 */

export async function createJewelPhotoTexture(

  scene: Scene,

  imageUrl: string,

  options?: JewelPhotoTextureOptions | number

): Promise<Texture> {

  const resolved = resolveRasterOptions(options);

  const shapeId = resolved.shapeId ?? "cube";

  const spec = resolveJewelPhotoRasterSpec(shapeId, resolved.photoLayout, {
    textureMaxEdge: resolved.textureMaxEdge,
    cubeTextureSize: resolved.cubeTextureSize,
  });

  const maxAnisotropy = resolved.maxAnisotropy ?? 16;



  const crop = resolved.crop;

  const center = crop?.center;

  const focus = crop?.focus;

  const subjectBounds = crop?.subjectBounds;



  let outWidth = spec.width;

  let outHeight = spec.height;

  if (resolved.preserveAlphaSource && isTransparentMatteDataUrl(imageUrl)) {

    const sq =
      spec.layout === "cube"
        ? spec.width
        : (resolved.textureMaxEdge ?? JEWEL_PHOTO_TEXTURE_MAX_EDGE);

    outWidth = sq;

    outHeight = sq;

  }

  const useDirectDraw =
    isLocalhostInteractivePreview() &&
    (imageUrl.startsWith("data:") || imageUrl.startsWith("blob:"));

  if (useDirectDraw) {
    // Upload previews: avoid ImageBitmap/OffscreenCanvas raster paths which can produce
    // blank results on some ANGLE/WebView setups. Show the original immediately.
    const texture = new Texture(
      imageUrl,
      scene,
      false,
      true,
      Texture.TRILINEAR_SAMPLINGMODE
    );
    configureJewelPhotoTexture(texture, maxAnisotropy);
    return texture;
  }



  const bitmapCacheKey = resolveJewelPhotoBitmapCacheKey(

    imageUrl,

    resolved,

    outWidth,

    outHeight

  );

  let bitmap = peekJewelPhotoBitmap(bitmapCacheKey);

  if (!bitmap) {

    let image: HTMLImageElement;

    try {

      image = await loadImageElement(imageUrl);

    } catch {

      image = await loadImageElement(createShowcaseDemoDataUrl(imageUrl.length % 5));

    }

    bitmap = await rasterJewelPhotoBitmap(

      image,

      outWidth,

      outHeight,

      spec,

      shapeId,

      resolved,

      center,

      focus,

      subjectBounds

    );

    storeJewelPhotoBitmap(bitmapCacheKey, bitmap, outWidth, outHeight);

  }



  const texture = new DynamicTexture(

    textureNameFromUrl(imageUrl),

    { width: outWidth, height: outHeight },

    scene,

    false,

    Texture.TRILINEAR_SAMPLINGMODE

  );

  const ctx = texture.getContext() as CanvasRenderingContext2D;

  ctx.drawImage(bitmap, 0, 0, outWidth, outHeight);

  texture.update(true);

  configureJewelPhotoTexture(texture, maxAnisotropy);

  return texture;

}



export async function preloadJewelPhotoTextures(

  scene: Scene,

  imageUrls: string[],

  options?: JewelPhotoTextureOptions | number

): Promise<Map<string, Texture>> {

  const unique = [...new Set(imageUrls)];

  const entries = await Promise.all(

    unique.map(async (url) => [url, await createJewelPhotoTexture(scene, url, options)] as const)

  );

  return new Map(entries);

}


