import type { ImageCenter, ImageFocus, SubjectBounds } from "../../../shared/types";
import type { PhotoCrystalPhotoLayoutId, PhotoCrystalShapeId } from "./photoCrystalShapeCatalog";

export type JewelPhotoCropMeta = {
  center?: ImageCenter;
  focus?: ImageFocus;
  subjectBounds?: SubjectBounds;
};

export type JewelPhotoTextureOptions = {
  shapeId?: PhotoCrystalShapeId;
  photoLayout?: PhotoCrystalPhotoLayoutId;
  crop?: JewelPhotoCropMeta;
  maxAnisotropy?: number;
  textureMaxEdge?: number;
  cubeTextureSize?: number;
  /** Use matte-aware source as-is (VoluMax fg). */
  preserveAlphaSource?: boolean;
};
