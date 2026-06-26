import type { ShowcaseCatalogOptions } from "../showcaseCatalogOptions";
import { DEFAULT_SHOWCASE_CATALOG } from "../showcaseCatalogOptions";

export type ShowcaseCatalogColorState = {
  photoFrameColorHex: string;
  crystalShellColorHex: string;
  /** 배경 영상/색이 크리스탈 표면 env에 반사되는 강도 */
  crystalBackdropBlend: number;
  /** 0 = 거의 투명한 얇은 유리, 1 = 두꺼운 페이퍼웨이트 */
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

/** Shell opacity — 0 = nearly invisible shell, 1 = heavy opaque paperweight glass. */
export function getCrystalShellAlphaMultiplier(): number {
  const t = shellThickness();
  if (t <= 0.001) return 0.028;
  if (t >= 0.999) return 1.0;
  const eased = Math.pow(t, 0.84);
  return 0.028 + eased * 0.97;
}

/** Facing-camera alpha retention — higher = thicker, more opaque glass on-axis. */
export function getCrystalShellViewClearFactor(): number {
  const t = shellThickness();
  if (t <= 0.001) return 0.58;
  if (t >= 0.999) return 0.97;
  const eased = Math.pow(t, 0.8);
  return 0.58 + eased * 0.39;
}

/** Frosted ice body toward camera — moderate so inner frame/photos stay readable. */
export function getCrystalShellIceSuppress(): number {
  const t = shellThickness();
  if (t <= 0.001) return 0;
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
  if (c <= 0.001) return 1;
  if (c >= 0.999) {
    const thickDamp = thick <= 0.001 ? 1 : 1 - thick * 0.04;
    return 9.2 * thickDamp;
  }
  const base = 1 + Math.pow(c, 0.58) * 8.1;
  const thickDamp = thick <= 0.001 ? 1 : 1 - thick * 0.1 * (1 - c);
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
