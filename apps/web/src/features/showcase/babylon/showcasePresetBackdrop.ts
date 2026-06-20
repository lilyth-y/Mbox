import type { ShowcaseBackgroundPreset } from "./weddingChapelEnvironment";
import type { ShowcaseBackdropSample } from "./showcaseBackdropSampler";

/** Static color samples for preset backgrounds (no DOM media). */
export function getShowcasePresetBackdropSample(
  preset: ShowcaseBackgroundPreset
): ShowcaseBackdropSample {
  if (preset === "solid_black") {
    return {
      average: { r: 0.02, g: 0.02, b: 0.03 },
      bright: { r: 0.07, g: 0.08, b: 0.1 },
      luminance: 0.028,
    };
  }
  if (preset === "soft_gray") {
    return {
      average: { r: 0.12, g: 0.12, b: 0.14 },
      bright: { r: 0.24, g: 0.24, b: 0.27 },
      luminance: 0.135,
    };
  }
  return {
    average: { r: 0.07, g: 0.09, b: 0.13 },
    bright: { r: 0.16, g: 0.22, b: 0.36 },
    luminance: 0.105,
  };
}

export function getShowcasePresetCssColor(preset: ShowcaseBackgroundPreset): string {
  if (preset === "solid_black") {
    return "#000000";
  }
  if (preset === "soft_gray") {
    return "#1e1e23";
  }
  return "#0a0e16";
}
