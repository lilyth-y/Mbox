import { getShowcasePhotoFrameHex } from "./babylon/showcasePhotoFrameColor";

import type { ShowcaseCatalogOptions } from "./showcaseCatalogOptions";

export const DEFAULT_SHOWCASE_CATALOG: ShowcaseCatalogOptions = {
  shapeId: "cube",
  photoLayout: "auto",
  framePresetId: "rose_gold",
  backgroundPreset: "booth",
  backgroundMediaSource: "builtin",
  backgroundMediaPath: "luxury/0_Background_Black_3840x2160 (1).mp4",
  backgroundMediaOpacity: 1,
  backgroundLightInfluence: 0.82,
  photoFrameColorHex: getShowcasePhotoFrameHex("rose_gold"),
  crystalShellColorHex: "#c8e8ff",
  crystalBackdropBlend: 0.88,
  crystalShellTransparency: 0.78,
  crystalPhotoClarity: 0.88,
  crystalGloss: 0.84,
  crystalSizeScale: 1,
  groundEnabled: false,
};
