import type { PhotoCrystalPhotoLayoutId, PhotoCrystalShapeId } from "./photoCrystalShapeCatalog";
import { resolvePhotoCrystalShape } from "./photoCrystalShapeCatalog";
import { computePhotoCrystalPortraitLayout } from "./photoCrystalPortraitLayout";
import { getInnerCubePhotoSize } from "./jewelPhotoInnerMesh";

function resolveLayout(
  shapeId: PhotoCrystalShapeId,
  photoLayout: PhotoCrystalPhotoLayoutId = "auto"
): "cube" | "portrait" {
  if (photoLayout !== "auto") {
    return photoLayout;
  }
  return resolvePhotoCrystalShape(shapeId).photoMode;
}

/** Long edge for jewel photo textures — originals are often 2K+. */
export const JEWEL_PHOTO_TEXTURE_MAX_EDGE = 2048;

export const JEWEL_PHOTO_CUBE_TEXTURE_SIZE = 1536;

export type JewelPhotoRasterSpec = {
  layout: "cube" | "portrait";
  width: number;
  height: number;
  /** Texture already matches plate — shader uses 1:1 UV. */
  preCroppedToPlate: boolean;
};

export type JewelPhotoRasterBudget = {
  textureMaxEdge?: number;
  cubeTextureSize?: number;
};

export function resolveJewelPhotoRasterSpec(
  shapeId: PhotoCrystalShapeId,
  photoLayout: PhotoCrystalPhotoLayoutId = "auto",
  budget?: JewelPhotoRasterBudget
): JewelPhotoRasterSpec {
  const layout = resolveLayout(shapeId, photoLayout);
  const maxEdge = budget?.textureMaxEdge ?? JEWEL_PHOTO_TEXTURE_MAX_EDGE;
  const cubeSize = budget?.cubeTextureSize ?? JEWEL_PHOTO_CUBE_TEXTURE_SIZE;

  if (layout === "cube") {
    return { layout, width: cubeSize, height: cubeSize, preCroppedToPlate: false };
  }

  // Sphere disc mesh — square raster, not portrait aspect crop.
  if (shapeId === "sphere") {
    return { layout, width: maxEdge, height: maxEdge, preCroppedToPlate: true };
  }

  const plate = computePhotoCrystalPortraitLayout(shapeId);
  const aspect = Math.max(plate.width / Math.max(plate.height, 0.001), 0.35);

  if (aspect >= 1) {
    const width = maxEdge;
    const height = Math.max(64, Math.round(maxEdge / aspect));
    return { layout, width, height, preCroppedToPlate: true };
  }

  const height = maxEdge;
  const width = Math.max(64, Math.round(maxEdge * aspect));
  return { layout, width, height, preCroppedToPlate: true };
}

export function resolveJewelPhotoRasterCacheKey(
  imageUrl: string,
  shapeId: PhotoCrystalShapeId,
  photoLayout: PhotoCrystalPhotoLayoutId = "auto",
  budget?: JewelPhotoRasterBudget
): string {
  const layout = resolveLayout(shapeId, photoLayout);
  const spec = resolveJewelPhotoRasterSpec(shapeId, photoLayout, budget);
  return `${imageUrl}@${shapeId}@${layout}@${spec.width}x${spec.height}`;
}

/** Pull camera framing extent after raster crop. */
export function getJewelPhotoRasterPullExtent(
  shapeId: PhotoCrystalShapeId,
  photoLayout: PhotoCrystalPhotoLayoutId = "auto"
): number {
  const spec = resolveJewelPhotoRasterSpec(shapeId, photoLayout);
  if (spec.layout === "cube") {
    return getInnerCubePhotoSize(shapeId);
  }
  const shape = resolvePhotoCrystalShape(shapeId);
  const plate = computePhotoCrystalPortraitLayout(shapeId);
  return Math.max(plate.width, plate.height) * shape.outerScale.x;
}
