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
export const JEWEL_PHOTO_TEXTURE_MAX_EDGE = 1536;

export const JEWEL_PHOTO_CUBE_TEXTURE_SIZE = 1024;

export type JewelPhotoRasterSpec = {
  layout: "cube" | "portrait";
  width: number;
  height: number;
  /** Texture already matches plate — shader uses 1:1 UV. */
  preCroppedToPlate: boolean;
};

export function resolveJewelPhotoRasterSpec(
  shapeId: PhotoCrystalShapeId,
  photoLayout: PhotoCrystalPhotoLayoutId = "auto"
): JewelPhotoRasterSpec {
  const layout = resolveLayout(shapeId, photoLayout);

  if (layout === "cube") {
    const size = JEWEL_PHOTO_CUBE_TEXTURE_SIZE;
    return { layout, width: size, height: size, preCroppedToPlate: false };
  }

  // Sphere disc mesh — square raster, not portrait aspect crop.
  if (shapeId === "sphere") {
    const size = JEWEL_PHOTO_TEXTURE_MAX_EDGE;
    return { layout, width: size, height: size, preCroppedToPlate: true };
  }

  const plate = computePhotoCrystalPortraitLayout(shapeId);
  const aspect = Math.max(plate.width / Math.max(plate.height, 0.001), 0.35);
  const maxEdge = JEWEL_PHOTO_TEXTURE_MAX_EDGE;

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
  photoLayout: PhotoCrystalPhotoLayoutId = "auto"
): string {
  const layout = resolveLayout(shapeId, photoLayout);
  const spec = resolveJewelPhotoRasterSpec(shapeId, photoLayout);
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
