import type { ShowcaseCatalogOptions } from "../showcaseCatalogOptions";
import { DEFAULT_SHOWCASE_CATALOG } from "../showcaseCatalogOptions";

export type ShowcaseCatalogColorState = {
  photoFrameColorHex: string;
  crystalShellColorHex: string;
  /** 배경 영상/색이 크리스탈 표면 env에 반사되는 강도 */
  crystalBackdropBlend: number;
  /** 0 = thin shell, 1 = thick frosted jewel glass */
  crystalShellTransparency: number;
  /** 0 = 흐림, 1 = 내부 사진 최대 선명 */
  crystalPhotoClarity: number;
  /** 0 = 무광, 1 = 강한 광택·하이라이트 */
  crystalGloss: number;
  crystalSizeScale: number;
};

let state: ShowcaseCatalogColorState = {
  photoFrameColorHex: DEFAULT_SHOWCASE_CATALOG.photoFrameColorHex,
  crystalShellColorHex: DEFAULT_SHOWCASE_CATALOG.crystalShellColorHex,
  crystalBackdropBlend: DEFAULT_SHOWCASE_CATALOG.crystalBackdropBlend,
  crystalShellTransparency: DEFAULT_SHOWCASE_CATALOG.crystalShellTransparency,
  crystalPhotoClarity: DEFAULT_SHOWCASE_CATALOG.crystalPhotoClarity,
  crystalGloss: DEFAULT_SHOWCASE_CATALOG.crystalGloss,
  crystalSizeScale: DEFAULT_SHOWCASE_CATALOG.crystalSizeScale,
};

export function getShowcaseCatalogColorState(): ShowcaseCatalogColorState {
  return state;
}

function shellThickness(): number {
  return Math.max(0, Math.min(1, state.crystalShellTransparency));
}

function photoClarity(): number {
  return Math.max(0, Math.min(1, state.crystalPhotoClarity));
}

function glossLevel(): number {
  return Math.max(0, Math.min(1, state.crystalGloss));
}

/** Shell opacity — thicker glass = much more visible jewel body. */
export function getCrystalShellAlphaMultiplier(): number {
  const t = shellThickness();
  if (t <= 0.001) return 0.14;
  if (t >= 0.999) return 0.94;
  const eased = Math.pow(t, 0.92);
  return 0.14 + eased * 0.8;
}

/** Facing-camera opacity floor — thick crystal stays visible on-axis. */
export function getCrystalShellViewClearFactor(): number {
  const t = shellThickness();
  if (t <= 0.001) return 0.22;
  if (t >= 0.999) return 0.52;
  const eased = Math.pow(t, 0.9);
  return 0.22 + eased * 0.3;
}

/** Frosted ice body toward camera — thick = richer jewel, less wash-out. */
export function getCrystalShellIceSuppress(): number {
  const t = shellThickness();
  return Math.pow(t, 0.72) * 0.78;
}

/** User gloss knob — independent from glass thickness. */
export function getCrystalShellGlossMultiplier(): number {
  const g = glossLevel();
  if (g <= 0.001) return 0.42;
  if (g >= 0.999) return 3.55;
  return 0.42 + Math.pow(g, 0.82) * 3.13;
}

/** 배경 env / 표면 반사 강도 (0~1 슬라이더 → 셰이더 스케일). */
export function getCrystalBackdropReflectionScale(): number {
  const blend = Math.max(0, Math.min(1, state.crystalBackdropBlend));
  return 0.12 + Math.pow(blend, 0.78) * 0.98;
}

/**
 * Inner photo RGB gain — independent clarity slider.
 * Thick crystal slightly dims photo so the glass body reads.
 */
export function getCrystalPhotoGain(): number {
  const c = photoClarity();
  const thick = shellThickness();
  if (c <= 0.001) return 0.72;
  if (c >= 0.999) {
    const thickDamp = 1 - thick * 0.08;
    return 6.85 * thickDamp;
  }
  const base = 0.72 + Math.pow(c, 0.68) * 6.13;
  const thickDamp = 1 - thick * 0.18 * (1 - c);
  return base * thickDamp;
}

/** @deprecated Use getCrystalPhotoGain — kept for call-site compat during tick. */
export function getCrystalPhotoVisibilityBoost(): number {
  return getCrystalPhotoGain() / 1.95;
}

export function bindShowcaseCatalogColors(catalog: ShowcaseCatalogOptions): void {
  state = {
    photoFrameColorHex: catalog.photoFrameColorHex,
    crystalShellColorHex: catalog.crystalShellColorHex,
    crystalBackdropBlend: catalog.crystalBackdropBlend,
    crystalShellTransparency: catalog.crystalShellTransparency,
    crystalPhotoClarity: catalog.crystalPhotoClarity,
    crystalGloss: catalog.crystalGloss,
    crystalSizeScale: catalog.crystalSizeScale,
  };
}

export function resetShowcaseCatalogColorState(): void {
  state = {
    photoFrameColorHex: DEFAULT_SHOWCASE_CATALOG.photoFrameColorHex,
    crystalShellColorHex: DEFAULT_SHOWCASE_CATALOG.crystalShellColorHex,
    crystalBackdropBlend: DEFAULT_SHOWCASE_CATALOG.crystalBackdropBlend,
    crystalShellTransparency: DEFAULT_SHOWCASE_CATALOG.crystalShellTransparency,
    crystalPhotoClarity: DEFAULT_SHOWCASE_CATALOG.crystalPhotoClarity,
    crystalGloss: DEFAULT_SHOWCASE_CATALOG.crystalGloss,
    crystalSizeScale: DEFAULT_SHOWCASE_CATALOG.crystalSizeScale,
  };
}
