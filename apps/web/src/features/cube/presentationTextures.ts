import * as THREE from "three";
import {
  isTransparentMatteDataUrl,
  resolveCubeFaceDisplayUrl,
  resolveSubjectForegroundUrl,
  isDistinctVoluMaxBackgroundPlate,
} from "@mbox/shared";
import type { ProcessedImage } from "../../shared/types";
import { drawImageCoverToSquare } from "../../shared/lib/backgroundPlate";
import type { PresentationTextureSnapshot } from "./cubeExportCapture";
import { isPresentationTextureReady } from "./cubeExportCapture";

const PRESENTATION_TEXTURE_SIZE = 1024;

/** WebGL photo sampling defaults — RepeatWrapping on NPOT JPEGs causes vertical stripe artifacts. */
export function configurePresentationTexture(
  texture: THREE.Texture,
  maxAnisotropy = 1
): void {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.unpackAlignment = 1;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.flipY = true;
  // 1024² canvas textures: mipmaps + anisotropy prevent oblique-view streaking (rotation moiré).
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = Math.max(1, maxAnisotropy);
}

export function applyPresentationTextureSampling(
  snapshot: PresentationTextureSnapshot,
  renderer: THREE.WebGLRenderer
): void {
  const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
  for (const texture of listPresentationTextures(snapshot)) {
    configurePresentationTexture(texture, maxAnisotropy);
    texture.needsUpdate = true;
  }
}

function listPresentationTextures(snapshot: PresentationTextureSnapshot): THREE.Texture[] {
  return [
    ...snapshot.textures,
    ...snapshot.plateTextures.filter((texture): texture is THREE.Texture => texture !== null),
    ...snapshot.subjectForegroundTextures.filter(
      (texture): texture is THREE.Texture => texture !== null
    ),
  ];
}

async function loadImageElement(url: string): Promise<HTMLImageElement> {
  const image = new Image();
  if (!url.startsWith("data:")) {
    image.crossOrigin = "anonymous";
  }
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error(`[CubeView] image load failed: ${url.slice(0, 80)}`));
    image.src = url;
  });
  if (typeof image.decode === "function") {
    try {
      await image.decode();
    } catch {
      // decode() can fail on some browsers; onload dimensions are still valid
    }
  }
  return image;
}

/**
 * Rasterize to 1024² CanvasTexture so GPU upload never hits stride/wrap glitches.
 * Canvas bake keeps GPU upload stable for both main app and wedding-simple.
 */
export async function rasterizePresentationTextureSafe(
  url: string
): Promise<THREE.CanvasTexture | null> {
  try {
    return await rasterizePresentationTexture(url);
  } catch (error) {
    console.warn("[presentationTextures] rasterize failed:", url.slice(0, 96), error);
    return null;
  }
}

export async function rasterizePresentationTexture(url: string): Promise<THREE.CanvasTexture> {
  const image = await loadImageElement(url);
  const canvas = document.createElement("canvas");
  canvas.width = PRESENTATION_TEXTURE_SIZE;
  canvas.height = PRESENTATION_TEXTURE_SIZE;
  const context = canvas.getContext("2d", { alpha: true });
  if (!context) {
    throw new Error("[CubeView] 2D canvas unavailable for presentation texture.");
  }
  // Cutout PNG/WebP must stay transparent — black fill shows through matte holes.
  if (isTransparentMatteDataUrl(url)) {
    context.clearRect(0, 0, PRESENTATION_TEXTURE_SIZE, PRESENTATION_TEXTURE_SIZE);
  } else {
    context.fillStyle = "#000000";
    context.fillRect(0, 0, PRESENTATION_TEXTURE_SIZE, PRESENTATION_TEXTURE_SIZE);
  }
  drawImageCoverToSquare(context, image, PRESENTATION_TEXTURE_SIZE);
  const texture = new THREE.CanvasTexture(canvas);
  configurePresentationTexture(texture, 1);
  texture.needsUpdate = true;
  return texture;
}

export async function loadPresentationTextureSet(
  orderedImages: ProcessedImage[],
  _voluMaxDepthEnabled: boolean
): Promise<PresentationTextureSnapshot> {
  const textures = await Promise.all(
    orderedImages.map(async (image) => {
      const displayUrl = resolveCubeFaceDisplayUrl(image);
      const baked =
        (await rasterizePresentationTextureSafe(displayUrl)) ?? null;
      if (baked) {
        return baked;
      }
      const fallbackUrl = image.url ?? displayUrl;
      return rasterizePresentationTexture(fallbackUrl);
    })
  );

  const plateTextures = await Promise.all(
    orderedImages.map(async (image, index) => {
      if (!image.backgroundPlateUrl || !isDistinctVoluMaxBackgroundPlate(image)) {
        return null;
      }
      const baked = await rasterizePresentationTextureSafe(image.backgroundPlateUrl);
      if (baked) {
        return baked;
      }
      return textures[index] ?? null;
    })
  );

  const subjectForegroundTextures = await Promise.all(
    orderedImages.map((image) => {
      const fgUrl = resolveSubjectForegroundUrl(image);
      return fgUrl && isTransparentMatteDataUrl(fgUrl)
        ? rasterizePresentationTextureSafe(fgUrl)
        : Promise.resolve(null);
    })
  );

  return { textures, plateTextures, subjectForegroundTextures };
}

/** Only wait for textures that this image slot actually uses. */
export function requiredPresentationTexturesReady(
  snapshot: PresentationTextureSnapshot,
  orderedImages: ProcessedImage[],
  _voluMaxDepthEnabled: boolean
): boolean {
  for (let index = 0; index < orderedImages.length; index += 1) {
    const image = orderedImages[index];
    const faceTexture = snapshot.textures[index];
    if (!faceTexture || !isPresentationTextureReady(faceTexture)) {
      return false;
    }
    const plate = snapshot.plateTextures[index];
    if (!plate || !isPresentationTextureReady(plate)) {
      return false;
    }
    const fgUrl = resolveSubjectForegroundUrl(image);
    if (fgUrl && isTransparentMatteDataUrl(fgUrl)) {
      const fg = snapshot.subjectForegroundTextures[index];
      if (!fg || !isPresentationTextureReady(fg)) {
        return false;
      }
    }
  }
  return true;
}

export function disposePresentationTextureSnapshot(
  snapshot: PresentationTextureSnapshot | null
): void {
  if (!snapshot) {
    return;
  }
  snapshot.textures.forEach((texture) => texture.dispose());
  snapshot.plateTextures.forEach((texture) => texture?.dispose());
  snapshot.subjectForegroundTextures.forEach((texture) => texture?.dispose());
}

/** Stable string so cube scene is not rebuilt when parent passes a new array with same images. */
export function buildCubeSceneContentKey(
  orderedImages: ProcessedImage[],
  voluMaxDepthEnabled: boolean
): string {
  return orderedImages
    .map(
      (image) =>
        [
          image.id,
          image.url,
          image.faceCompositeUrl ?? "",
          image.backgroundPlateUrl ?? "",
          image.subjectForegroundUrl ?? "",
          image.voluMaxForegroundKind ?? "",
          image.preprocessMode ?? "",
        ].join("\u0001")
    )
    .join("\u0002")
    .concat("\u0003", voluMaxDepthEnabled ? "1" : "0");
}
