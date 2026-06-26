import {
  isShowcaseCommercialLookId,
  SHOWCASE_COMMERCIAL_LOOK_PRESETS,
  type ShowcaseCommercialLookId,
} from "@mbox/shared";

import { getShowcasePhotoFrameHex } from "./babylon/showcasePhotoFrameColor";

import { DEFAULT_SHOWCASE_CATALOG } from "./showcaseCatalogDefaults";
import { SHOWCASE_DEFAULT_BACKDROP_PATH } from "./showcaseBackgroundMedia";

import type { ShowcaseCatalogOptions } from "./showcaseCatalogOptions";

export { SHOWCASE_COMMERCIAL_LOOK_PRESETS, type ShowcaseCommercialLookId };

const PRESET_CATALOG: Record<ShowcaseCommercialLookId, ShowcaseCatalogOptions> = {
  rose_gold_premium: {
    ...DEFAULT_SHOWCASE_CATALOG,
    shapeId: "cube",
    photoLayout: "auto",
    framePresetId: "rose_gold",
    backgroundPreset: "booth",
    backgroundMediaSource: "builtin",
    backgroundMediaPath: SHOWCASE_DEFAULT_BACKDROP_PATH,
    backgroundMediaOpacity: 1,
    backgroundLightInfluence: 0.68,
    photoFrameColorHex: getShowcasePhotoFrameHex("rose_gold"),
    crystalShellColorHex: "#ffd8cc",
    crystalBackdropBlend: 0.72,
    crystalShellTransparency: 0.94,
    crystalPhotoClarity: 0,
    crystalGloss: 0.72,
    crystalSizeScale: 1,
    groundEnabled: false,
  },
  classic: {
    ...DEFAULT_SHOWCASE_CATALOG,
    shapeId: "cube",
    photoLayout: "auto",
    framePresetId: "pearl_white",
    backgroundPreset: "soft_gray",
    backgroundMediaSource: "builtin",
    backgroundMediaPath: "luxury/0_Animation_White_1080x1920.mp4",
    backgroundMediaOpacity: 0.92,
    backgroundLightInfluence: 0.68,
    photoFrameColorHex: getShowcasePhotoFrameHex("pearl_white"),
    crystalShellColorHex: "#e4eef8",
    crystalBackdropBlend: 0.68,
    crystalShellTransparency: 0.94,
    crystalPhotoClarity: 0,
    crystalGloss: 0.68,
    crystalSizeScale: 1,
    groundEnabled: false,
  },
  modern_black: {
    ...DEFAULT_SHOWCASE_CATALOG,
    shapeId: "cube",
    photoLayout: "auto",
    framePresetId: "classic_black",
    backgroundPreset: "solid_black",
    backgroundMediaSource: "builtin",
    backgroundMediaPath: SHOWCASE_DEFAULT_BACKDROP_PATH,
    backgroundMediaOpacity: 1,
    backgroundLightInfluence: 0.52,
    photoFrameColorHex: getShowcasePhotoFrameHex("classic_black"),
    crystalShellColorHex: "#a8b8d0",
    crystalBackdropBlend: 0.62,
    crystalShellTransparency: 0.92,
    crystalPhotoClarity: 0,
    crystalGloss: 0.78,
    crystalSizeScale: 1,
    groundEnabled: false,
  },
};

const COMPARE_KEYS: (keyof ShowcaseCatalogOptions)[] = [
  "shapeId",
  "photoLayout",
  "framePresetId",
  "backgroundPreset",
  "backgroundMediaSource",
  "backgroundMediaPath",
  "backgroundMediaOpacity",
  "backgroundLightInfluence",
  "photoFrameColorHex",
  "crystalShellColorHex",
  "crystalBackdropBlend",
  "crystalShellTransparency",
  "crystalPhotoClarity",
  "crystalGloss",
  "crystalSizeScale",
  "groundEnabled",
];

function catalogMatchesPreset(
  options: ShowcaseCatalogOptions,
  presetId: ShowcaseCommercialLookId
): boolean {
  const preset = PRESET_CATALOG[presetId];
  return COMPARE_KEYS.every((key) => options[key] === preset[key]);
}

export function applyShowcaseCommercialLook(
  lookId: ShowcaseCommercialLookId,
  base: ShowcaseCatalogOptions = DEFAULT_SHOWCASE_CATALOG
): ShowcaseCatalogOptions {
  return { ...base, ...PRESET_CATALOG[lookId] };
}

export function detectShowcaseCommercialLookId(
  options: ShowcaseCatalogOptions
): ShowcaseCommercialLookId | null {
  for (const preset of SHOWCASE_COMMERCIAL_LOOK_PRESETS) {
    if (catalogMatchesPreset(options, preset.id)) {
      return preset.id;
    }
  }
  return null;
}

export function parseShowcaseCommercialLookParam(
  raw: string | null
): ShowcaseCommercialLookId | null {
  if (!raw || !isShowcaseCommercialLookId(raw)) {
    return null;
  }
  return raw;
}
