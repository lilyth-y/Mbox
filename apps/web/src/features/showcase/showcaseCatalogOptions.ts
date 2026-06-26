import type { CubeBgmTrackId } from "@mbox/shared";
import type { PhotoCrystalPhotoLayoutId, PhotoCrystalShapeId } from "./babylon/photoCrystalShapeCatalog";

import { PHOTO_CRYSTAL_SHAPES, resolvePhotoCrystalShape } from "./babylon/photoCrystalShapeCatalog";

import type { ShowcasePhotoFramePresetId } from "./babylon/showcasePhotoFrameColor";

import {
  SHOWCASE_PHOTO_FRAME_OPTIONS,
} from "./babylon/showcasePhotoFrameColor";

import type { ShowcaseBackgroundPreset } from "./babylon/weddingChapelEnvironment";

import { backgroundAssetDisplayName, isBackgroundVideoPath } from "../../shared/lib/backgroundAssetCatalog";

import { DEFAULT_SHOWCASE_CATALOG } from "./showcaseCatalogDefaults";

import {
  applyShowcaseCommercialLook,
  detectShowcaseCommercialLookId,
  parseShowcaseCommercialLookParam,
  SHOWCASE_COMMERCIAL_LOOK_PRESETS,
} from "./showcaseCommercialPresets";

export { DEFAULT_SHOWCASE_CATALOG } from "./showcaseCatalogDefaults";



export type ShowcaseBackgroundMediaSource = "none" | "builtin" | "custom";



export type ShowcaseCatalogOptions = {

  shapeId: PhotoCrystalShapeId;

  photoLayout: PhotoCrystalPhotoLayoutId;

  framePresetId: ShowcasePhotoFramePresetId;

  backgroundPreset: ShowcaseBackgroundPreset;

  backgroundMediaSource: ShowcaseBackgroundMediaSource;

  /** Catalog path (`default/rose.mp4`) or data URL for user upload. */

  backgroundMediaPath: string | null;

  /** Required for custom blob uploads (no file extension in URL). */
  backgroundMediaIsVideo: boolean;

  backgroundMediaOpacity: number;

  backgroundLightInfluence: number;

  /** 사진 액자 색 (#RRGGBB) */
  photoFrameColorHex: string;

  /** 크리스탈 셸 틴트 색 (#RRGGBB) */
  crystalShellColorHex: string;

  /** 배경 조화 반영 비율 (0~1, 높을수록 배경 빛/색 반영) */
  crystalBackdropBlend: number;

  /** 크리스탈 셸 두께감 (0~1, 낮을수록 유리 얇음 · 높을수록 두꺼운 유리) */
  crystalShellTransparency: number;

  /** 내부 사진 선명도 (0~1, 사진 밝기·가독성 — 유리 두께와 별도) */
  crystalPhotoClarity: number;

  /** 크리스탈 표면 광택 (0~1) */
  crystalGloss: number;

  /** 전체 크리스탈 크기 배율 (큐브·기타 형태 공통) */
  crystalSizeScale: number;

  groundEnabled: boolean;

  /** MP4 export + live preview */
  bgmEnabled: boolean;
  bgmTrackId: CubeBgmTrackId;
  bgmVolume: number;
  /** User workspace MP3 (`workspace` track) */
  bgmWorkspacePath: string | null;

  /** One distinct photo per cube face (six-face cube mode). */
  cubePerFacePhotos: boolean;

};



export const SHOWCASE_PHOTO_LAYOUT_OPTIONS: {

  id: PhotoCrystalPhotoLayoutId;

  labelKo: string;

}[] = [

  { id: "auto", labelKo: "자동" },

  { id: "cube", labelKo: "큐브(6면)" },

  { id: "portrait", labelKo: "세로 각인" },

];



export const SHOWCASE_BACKGROUND_OPTIONS: { id: ShowcaseBackgroundPreset; labelKo: string }[] = [

  { id: "booth", labelKo: "홀로 부스" },

  { id: "solid_black", labelKo: "검정 배경" },

  { id: "soft_gray", labelKo: "소프트 그레이" },

];



const SHAPE_IDS = new Set(PHOTO_CRYSTAL_SHAPES.map((s) => s.id));

const BG_IDS = new Set(SHOWCASE_BACKGROUND_OPTIONS.map((b) => b.id));

const LAYOUT_IDS = new Set(SHOWCASE_PHOTO_LAYOUT_OPTIONS.map((o) => o.id));

const FRAME_IDS = new Set(SHOWCASE_PHOTO_FRAME_OPTIONS.map((f) => f.id));



function parseShapeId(raw: string | null, fallback: PhotoCrystalShapeId): PhotoCrystalShapeId {

  if (raw && SHAPE_IDS.has(raw as PhotoCrystalShapeId)) {

    return raw as PhotoCrystalShapeId;

  }

  return fallback;

}



function parsePhotoLayout(raw: string | null, fallback: PhotoCrystalPhotoLayoutId): PhotoCrystalPhotoLayoutId {

  if (raw && LAYOUT_IDS.has(raw as PhotoCrystalPhotoLayoutId)) {

    return raw as PhotoCrystalPhotoLayoutId;

  }

  return fallback;

}



function parseFramePreset(raw: string | null, fallback: ShowcasePhotoFramePresetId): ShowcasePhotoFramePresetId {

  if (raw && FRAME_IDS.has(raw as ShowcasePhotoFramePresetId)) {

    return raw as ShowcasePhotoFramePresetId;

  }

  return fallback;

}



function parseBackgroundPreset(raw: string | null, fallback: ShowcaseBackgroundPreset): ShowcaseBackgroundPreset {

  if (raw && BG_IDS.has(raw as ShowcaseBackgroundPreset)) {

    return raw as ShowcaseBackgroundPreset;

  }

  return fallback;

}



function parseOpacity(raw: string | null, fallback: number): number {

  if (!raw) {

    return fallback;

  }

  const value = Number(raw);

  if (!Number.isFinite(value)) {

    return fallback;

  }

  return Math.max(0.25, Math.min(1, value));

}



function parseInfluence(raw: string | null, fallback: number): number {

  if (!raw) {

    return fallback;

  }

  const value = Number(raw);

  if (!Number.isFinite(value)) {

    return fallback;

  }

  return Math.max(0, Math.min(1, value));

}



function parseHexColorParam(raw: string | null, fallback: string): string {

  if (!raw) {

    return fallback;

  }

  const normalized = raw.trim().replace(/^#/, "");

  return /^[0-9a-fA-F]{6}$/.test(normalized) ? `#${normalized.toLowerCase()}` : fallback;

}



function parseBlend(raw: string | null, fallback: number): number {

  if (!raw) {

    return fallback;

  }

  const value = Number(raw);

  if (!Number.isFinite(value)) {

    return fallback;

  }

  return Math.max(0, Math.min(1, value));

}



function parseUnit(raw: string | null, fallback: number): number {
  if (!raw) {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(0, Math.min(1, value));
}

function parseSizeScale(raw: string | null, fallback: number): number {
  if (!raw) {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(0.55, Math.min(1.45, value));
}

const CATALOG_QUERY_KEYS = new Set([
  "look",
  "shape",
  "photo",
  "frame",
  "bg",
  "backdrop",
  "bgOpacity",
  "bgLight",
  "photoFrameColor",
  "crystalColor",
  "crystalBlend",
  "crystalTrans",
  "photoClarity",
  "crystalGloss",
  "crystalSize",
  "floor",
  "cubeFaces",
  "perFace",
]);

function resolveShowcaseCatalogBase(params: URLSearchParams): ShowcaseCatalogOptions {
  const lookId = parseShowcaseCommercialLookParam(params.get("look"));
  if (lookId) {
    return applyShowcaseCommercialLook(lookId);
  }
  const hasCatalogParams = [...params.keys()].some((key) => CATALOG_QUERY_KEYS.has(key));
  if (!hasCatalogParams) {
    return applyShowcaseCommercialLook("rose_gold_premium");
  }
  return DEFAULT_SHOWCASE_CATALOG;
}

export function parseShowcaseCatalogFromSearch(search: string): ShowcaseCatalogOptions {

  const params = new URLSearchParams(search);

  const base = resolveShowcaseCatalogBase(params);

  const backdropParam = params.get("backdrop");

  const backdrop = backdropParam ?? base.backgroundMediaPath;

  const mediaSource: ShowcaseBackgroundMediaSource = backdrop

    ? backdropParam

      ? "builtin"

      : base.backgroundMediaSource

    : params.has("backdrop")

      ? "none"

      : base.backgroundMediaSource === "none"

        ? "none"

        : base.backgroundMediaSource;

  return {

    shapeId: parseShapeId(params.get("shape"), base.shapeId),

    photoLayout: parsePhotoLayout(params.get("photo"), base.photoLayout),

    framePresetId: parseFramePreset(params.get("frame"), base.framePresetId),

    backgroundPreset: parseBackgroundPreset(params.get("bg"), base.backgroundPreset),

    backgroundMediaSource: mediaSource,

    backgroundMediaPath: backdrop,

    backgroundMediaIsVideo: isBackgroundVideoPath(backdrop),

    backgroundMediaOpacity: parseOpacity(params.get("bgOpacity"), base.backgroundMediaOpacity),

    backgroundLightInfluence: parseInfluence(params.get("bgLight"), base.backgroundLightInfluence),

    photoFrameColorHex: parseHexColorParam(
      params.get("photoFrameColor"),
      base.photoFrameColorHex
    ),

    crystalShellColorHex: parseHexColorParam(
      params.get("crystalColor"),
      base.crystalShellColorHex
    ),

    crystalBackdropBlend: parseBlend(params.get("crystalBlend"), base.crystalBackdropBlend),

    crystalShellTransparency: parseUnit(
      params.get("crystalTrans"),
      base.crystalShellTransparency
    ),

    crystalPhotoClarity: parseUnit(
      params.get("photoClarity"),
      base.crystalPhotoClarity
    ),

    crystalGloss: parseUnit(params.get("crystalGloss"), base.crystalGloss),

    crystalSizeScale: parseSizeScale(
      params.get("crystalSize"),
      base.crystalSizeScale
    ),

    groundEnabled: params.has("floor")

      ? params.get("floor") !== "off"

      : base.groundEnabled,

    bgmEnabled: base.bgmEnabled,

    bgmTrackId: base.bgmTrackId,

    bgmVolume: base.bgmVolume,

    bgmWorkspacePath: base.bgmWorkspacePath,

    cubePerFacePhotos: params.has("cubeFaces")
      ? params.get("cubeFaces") === "6"
      : params.has("perFace")
        ? params.get("perFace") === "1"
        : base.cubePerFacePhotos,

  };

}



export function buildShowcaseSearchParams(options: ShowcaseCatalogOptions): URLSearchParams {

  const params = new URLSearchParams();

  const lookId = detectShowcaseCommercialLookId(options);

  if (lookId) {

    params.set("look", lookId);

    return params;

  }

  if (options.shapeId !== DEFAULT_SHOWCASE_CATALOG.shapeId) {

    params.set("shape", options.shapeId);

  }

  if (options.photoLayout !== DEFAULT_SHOWCASE_CATALOG.photoLayout) {

    params.set("photo", options.photoLayout);

  }

  if (options.framePresetId !== DEFAULT_SHOWCASE_CATALOG.framePresetId) {

    params.set("frame", options.framePresetId);

  }

  if (options.backgroundPreset !== DEFAULT_SHOWCASE_CATALOG.backgroundPreset) {

    params.set("bg", options.backgroundPreset);

  }

  if (
    options.backgroundMediaSource === "builtin" &&
    options.backgroundMediaPath &&
    options.backgroundMediaPath !== DEFAULT_SHOWCASE_CATALOG.backgroundMediaPath
  ) {

    params.set("backdrop", options.backgroundMediaPath);

  }

  if (options.backgroundMediaOpacity !== DEFAULT_SHOWCASE_CATALOG.backgroundMediaOpacity) {

    params.set("bgOpacity", String(options.backgroundMediaOpacity));

  }

  if (options.backgroundLightInfluence !== DEFAULT_SHOWCASE_CATALOG.backgroundLightInfluence) {

    params.set("bgLight", String(options.backgroundLightInfluence));

  }

  if (options.photoFrameColorHex !== DEFAULT_SHOWCASE_CATALOG.photoFrameColorHex) {

    params.set("photoFrameColor", options.photoFrameColorHex.replace(/^#/, ""));

  }

  if (options.crystalShellColorHex !== DEFAULT_SHOWCASE_CATALOG.crystalShellColorHex) {

    params.set("crystalColor", options.crystalShellColorHex.replace(/^#/, ""));

  }

  if (options.crystalBackdropBlend !== DEFAULT_SHOWCASE_CATALOG.crystalBackdropBlend) {

    params.set("crystalBlend", String(options.crystalBackdropBlend));

  }

  if (
    options.crystalShellTransparency !== DEFAULT_SHOWCASE_CATALOG.crystalShellTransparency
  ) {
    params.set("crystalTrans", String(options.crystalShellTransparency));
  }

  if (options.crystalPhotoClarity !== DEFAULT_SHOWCASE_CATALOG.crystalPhotoClarity) {
    params.set("photoClarity", String(options.crystalPhotoClarity));
  }

  if (options.crystalGloss !== DEFAULT_SHOWCASE_CATALOG.crystalGloss) {
    params.set("crystalGloss", String(options.crystalGloss));
  }

  if (options.crystalSizeScale !== DEFAULT_SHOWCASE_CATALOG.crystalSizeScale) {
    params.set("crystalSize", String(options.crystalSizeScale));
  }

  if (options.groundEnabled !== DEFAULT_SHOWCASE_CATALOG.groundEnabled) {

    params.set("floor", options.groundEnabled ? "on" : "off");

  }

  if (options.cubePerFacePhotos) {
    params.set("cubeFaces", "6");
  }

  return params;

}



export function syncShowcaseCatalogToUrl(options: ShowcaseCatalogOptions): void {

  const qs = buildShowcaseSearchParams(options).toString();

  const url = `${window.location.pathname}${qs ? `?${qs}` : ""}`;

  window.history.replaceState(null, "", url);

}



export function formatShowcaseCatalogSummary(options: ShowcaseCatalogOptions): string {

  const lookId = detectShowcaseCommercialLookId(options);

  const lookLabel = SHOWCASE_COMMERCIAL_LOOK_PRESETS.find((p) => p.id === lookId)?.labelKo;

  const shape = resolvePhotoCrystalShape(options.shapeId).labelKo;

  const layout =

    SHOWCASE_PHOTO_LAYOUT_OPTIONS.find((o) => o.id === options.photoLayout)?.labelKo ??

    options.photoLayout;

  const frame =

    SHOWCASE_PHOTO_FRAME_OPTIONS.find((f) => f.id === options.framePresetId)?.labelKo ??

    options.framePresetId;

  let bg =

    SHOWCASE_BACKGROUND_OPTIONS.find((b) => b.id === options.backgroundPreset)?.labelKo ??

    options.backgroundPreset;

  if (options.backgroundMediaSource === "builtin" && options.backgroundMediaPath) {

    bg = `미디어 · ${backgroundAssetDisplayName(options.backgroundMediaPath)}`;

  } else if (options.backgroundMediaSource === "custom") {

    bg = "미디어 · 내 파일";

  }

  const floor = options.groundEnabled ? "바닥 ON" : "바닥 OFF";

  const prefix = lookLabel ? `${lookLabel} · ` : "";

  return `${prefix}${shape} · ${layout} · ${frame} · ${bg} · ${floor}`;

}


