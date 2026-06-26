import { getShowcasePhotoFrameHex } from "./babylon/showcasePhotoFrameColor";
import { SHOWCASE_DEFAULT_BACKDROP_PATH } from "./showcaseBackgroundMedia";

import type { ShowcaseCatalogOptions } from "./showcaseCatalogOptions";

export const DEFAULT_SHOWCASE_CATALOG: ShowcaseCatalogOptions = {
  shapeId: "cube",
  photoLayout: "auto",
  framePresetId: "rose_gold",
  backgroundPreset: "booth",
  backgroundMediaSource: "builtin",
  backgroundMediaPath: SHOWCASE_DEFAULT_BACKDROP_PATH,
  backgroundMediaIsVideo: true,
  backgroundMediaOpacity: 1,
  backgroundLightInfluence: 0.68,
  photoFrameColorHex: getShowcasePhotoFrameHex("rose_gold"),
  crystalShellColorHex: "#c8e8ff",
  crystalBackdropBlend: 0.72,
  crystalShellTransparency: 0.94,
  crystalPhotoClarity: 0,
  crystalGloss: 0.72,
  crystalSizeScale: 1,
  groundEnabled: false,
  bgmEnabled: false,
  bgmTrackId: "cinematic_romantic",
  bgmVolume: 0.85,
  bgmWorkspacePath: null,
  cubePerFacePhotos: false,
};
