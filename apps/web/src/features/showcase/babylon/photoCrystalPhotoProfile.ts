import type { PhotoCrystalShapeId } from "./photoCrystalShapeCatalog";



/** Photo / frame clip follows this silhouette (not a generic rectangle). */

export type PhotoSilhouetteKind = "rect" | "circle" | "heart" | "polygon";



/** Per-shape etched photo rules (laser crystal product conventions). */

export type PhotoCrystalPhotoProfile = {

  silhouette: PhotoSilhouetteKind;

  /** Regular polygon sides when silhouette === "polygon". */

  polygonSides?: number;

  frameEnabled: boolean;

  useSquarePlate: boolean;

  surfaceInset: number;

  centerInVolume: boolean;

  edgeSoftness: number;

  useFramedSlab: boolean;

  plateDepthScale: number;

  photoHeightCap?: number;

  photoViewportFill?: number;

};



const portraitDefaults = {
  useSquarePlate: false,
  surfaceInset: 1,
  centerInVolume: true,
  edgeSoftness: 0,
  useFramedSlab: false,
  plateDepthScale: 0,
} as const;



export function getPhotoCrystalPhotoProfile(shapeId: PhotoCrystalShapeId): PhotoCrystalPhotoProfile {

  switch (shapeId) {

    case "sphere":
      return {
        silhouette: "circle",
        frameEnabled: true,
        ...portraitDefaults,
        useSquarePlate: true,
        photoViewportFill: 1,
      };

    case "heart":
      return {
        silhouette: "heart",
        frameEnabled: true,
        ...portraitDefaults,
        photoViewportFill: 1,
      };

    case "hex_prism":
      return {
        silhouette: "polygon",
        polygonSides: 6,
        frameEnabled: true,
        ...portraitDefaults,
        photoHeightCap: 0.94,
        photoViewportFill: 1,
      };

    case "gem_prism":
      return {
        silhouette: "polygon",
        polygonSides: 10,
        frameEnabled: true,
        ...portraitDefaults,
        photoHeightCap: 0.9,
        photoViewportFill: 1,
      };

    case "tall_rect":
      return {
        silhouette: "rect",
        frameEnabled: true,
        ...portraitDefaults,
        photoHeightCap: 0.9,
        photoViewportFill: 1,
      };

    case "cube":

      return {

        silhouette: "rect",

        frameEnabled: true,

        ...portraitDefaults,

      };

    default:

      return {

        silhouette: "rect",

        frameEnabled: true,

        ...portraitDefaults,

      };

  }

}



/** Shader uniform: 0 rect, 1 circle, 2 heart, 3 polygon. */

export function photoSilhouetteKindToShaderId(kind: PhotoSilhouetteKind): number {

  switch (kind) {

    case "circle":

      return 1;

    case "heart":

      return 2;

    case "polygon":

      return 3;

    default:

      return 0;

  }

}


