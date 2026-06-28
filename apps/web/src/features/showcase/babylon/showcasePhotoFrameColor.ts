import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { CubeFramePresetId } from "@mbox/shared";
import { CUBE_FRAME_PRESET_IDS } from "@mbox/shared";
import {
  setJewelInnerPhotoFrameColor,
  setJewelInnerPhotoFrameEnabled,
} from "./jewelInnerPhotoMaterial";
import { isStandardJewelPhotoMaterial, type JewelPhotoDisplayMaterial } from "./jewelPhotoMaterialBridge";
import { getPhotoCrystalPhotoProfile } from "./photoCrystalPhotoProfile";
import type { PhotoCrystalPhotoMode, PhotoCrystalShapeId } from "./photoCrystalShapeCatalog";
import { color3ToHex, parseHexColor3 } from "./showcaseColorParse";

export type ShowcasePhotoFramePresetId = CubeFramePresetId | "none";

export const SHOWCASE_PHOTO_FRAME_OPTIONS: {
  id: ShowcasePhotoFramePresetId;
  labelKo: string;
}[] = [
  { id: "none", labelKo: "없음" },
  { id: "rose_gold", labelKo: "로즈골드" },
  { id: "pearl_white", labelKo: "펄 화이트" },
  { id: "classic_black", labelKo: "클래식 블랙" },
  { id: "sage_garden", labelKo: "세이지" },
  { id: "royal_navy", labelKo: "로얄 네이비" },
];

const FRAME_RGB: Record<CubeFramePresetId, [number, number, number]> = {
  rose_gold: [0.86, 0.7, 0.62],
  pearl_white: [0.84, 0.84, 0.88],
  classic_black: [0.32, 0.32, 0.36],
  sage_garden: [0.7, 0.78, 0.66],
  royal_navy: [0.52, 0.6, 0.76],
};

const PRESET_SET = new Set<string>([...CUBE_FRAME_PRESET_IDS, "none"]);

export function isShowcasePhotoFrameEnabled(presetId: ShowcasePhotoFramePresetId): boolean {
  return presetId !== "none";
}

export function resolveShowcasePhotoFramePresetId(
  raw: string | null | undefined
): ShowcasePhotoFramePresetId {
  if (raw && PRESET_SET.has(raw)) {
    return raw as ShowcasePhotoFramePresetId;
  }
  return "none";
}

export function getShowcasePhotoFrameColor3(presetId: ShowcasePhotoFramePresetId): Color3 {
  if (presetId === "none") {
    return new Color3(0.88, 0.92, 0.98);
  }
  const rgb = FRAME_RGB[presetId] ?? FRAME_RGB.rose_gold;
  return new Color3(rgb[0], rgb[1], rgb[2]);
}

export function getShowcasePhotoFrameHex(presetId: ShowcasePhotoFramePresetId): string {
  return color3ToHex(getShowcasePhotoFrameColor3(presetId));
}

export function applyShowcaseFrameSettingsToMaterial(
  material: JewelPhotoDisplayMaterial,
  presetId: ShowcasePhotoFramePresetId,
  photoFrameColorHex?: string
): void {
  if (isStandardJewelPhotoMaterial(material)) {
    return;
  }
  const enabled = isShowcasePhotoFrameEnabled(presetId);
  setJewelInnerPhotoFrameEnabled(material, enabled);
  if (enabled) {
    const color = photoFrameColorHex
      ? parseHexColor3(photoFrameColorHex, getShowcasePhotoFrameColor3(presetId))
      : getShowcasePhotoFrameColor3(presetId);
    setJewelInnerPhotoFrameColor(material, color);
  }
}

export function resolveShowcaseFramePresetForLayout(
  presetId: ShowcasePhotoFramePresetId,
  shapeId: PhotoCrystalShapeId,
  _photoLayout?: PhotoCrystalPhotoMode
): ShowcasePhotoFramePresetId {
  if (presetId === "none") {
    return "none";
  }
  if (!getPhotoCrystalPhotoProfile(shapeId).frameEnabled) {
    return "none";
  }
  return presetId;
}

export function applyShowcaseFrameSettingsToRig(
  rig: {
    bgMatA: JewelPhotoDisplayMaterial;
    bgMatB: JewelPhotoDisplayMaterial;
    fgMatA: JewelPhotoDisplayMaterial | null;
    fgMatB: JewelPhotoDisplayMaterial | null;
    shapeId?: PhotoCrystalShapeId;
    photoLayout?: PhotoCrystalPhotoMode;
  },
  presetId: ShowcasePhotoFramePresetId,
  photoFrameColorHex?: string
): void {
  const effectivePreset = resolveShowcaseFramePresetForLayout(
    presetId,
    rig.shapeId ?? "cube",
    rig.photoLayout ?? "cube"
  );
  applyShowcaseFrameSettingsToMaterial(rig.bgMatA, effectivePreset, photoFrameColorHex);
  applyShowcaseFrameSettingsToMaterial(rig.bgMatB, effectivePreset, photoFrameColorHex);
  if (rig.fgMatA) {
    applyShowcaseFrameSettingsToMaterial(rig.fgMatA, effectivePreset, photoFrameColorHex);
  }
  if (rig.fgMatB) {
    applyShowcaseFrameSettingsToMaterial(rig.fgMatB, effectivePreset, photoFrameColorHex);
  }
}
