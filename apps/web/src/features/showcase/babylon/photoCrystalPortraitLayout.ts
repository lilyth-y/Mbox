import type { PhotoCrystalShapeId } from "./photoCrystalShapeCatalog";
import { resolvePhotoCrystalShape } from "./photoCrystalShapeCatalog";
import { getPhotoCrystalPhotoProfile } from "./photoCrystalPhotoProfile";
import {
  fitPortraitInCircle,
  fitPortraitToBounds,
  getShapeInnerPhotoAnchor,
} from "./photoCrystalShapeGeometry";

/** Etched portrait plate — width/height in meters, local position inside collider. */
export type PhotoCrystalPortraitLayout = {
  width: number;
  height: number;
  position: { x: number; y: number; z: number };
};

/**
 * Portrait plate sized and anchored inside each shell cavity (not on the outer surface).
 */
export function computePhotoCrystalPortraitLayout(
  shapeId: PhotoCrystalShapeId
): PhotoCrystalPortraitLayout {
  const shape = resolvePhotoCrystalShape(shapeId);
  const aspect = shape.portraitAspect;
  const profile = getPhotoCrystalPhotoProfile(shapeId);
  const anchor = getShapeInnerPhotoAnchor(shapeId);
  const heightCap = profile.photoHeightCap ?? 1;

  const maxWidth = anchor.maxWidth * profile.surfaceInset;
  const maxHeight = anchor.maxHeight * profile.surfaceInset * heightCap;

  const plate = anchor.useCircleFit
    ? fitPortraitInCircle(maxWidth * 0.5, aspect, anchor.fill)
    : fitPortraitToBounds(maxWidth, maxHeight, aspect, anchor.fill);

  return {
    width: plate.width,
    height: plate.height,
    position: {
      x: anchor.center.x,
      y: anchor.center.y,
      z: anchor.center.z,
    },
  };
}
