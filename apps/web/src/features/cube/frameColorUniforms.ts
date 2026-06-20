import * as THREE from "three";

export type FrameColorUniforms = {
  uCustomFrameColor: { value: THREE.Vector3 };
  uUseCustomFrameColor: { value: number };
};

export function parseFrameColorHex(input: string | null | undefined): THREE.Vector3 | null {
  if (!input || typeof input !== "string") return null;
  const hex = input.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return null;
  const value = parseInt(hex, 16);
  return new THREE.Vector3(
    ((value >> 16) & 255) / 255,
    ((value >> 8) & 255) / 255,
    (value & 255) / 255
  );
}

export function createCustomFrameColorUniforms(
  customFrameColor: string | null | undefined
): FrameColorUniforms {
  const rgb = parseFrameColorHex(customFrameColor);
  return {
    uCustomFrameColor: { value: rgb ?? new THREE.Vector3(0.87, 0.7, 0.53) },
    uUseCustomFrameColor: { value: rgb ? 1 : 0 },
  };
}

export function setCustomFrameColorUniforms(
  uniforms: FrameColorUniforms,
  customFrameColor: string | null | undefined
): void {
  const rgb = parseFrameColorHex(customFrameColor);
  uniforms.uUseCustomFrameColor.value = rgb ? 1 : 0;
  if (rgb) {
    uniforms.uCustomFrameColor.value.copy(rgb);
  }
}

export function frameColorHexFromPreset(presetId: string): string {
  const map: Record<string, string> = {
    rose_gold: "#e5b3b3",
    pearl_white: "#e8eaed",
    classic_black: "#d4af5f",
    sage_garden: "#a7c4a7",
    royal_navy: "#d4af5f",
    silver_crystal: "#e2e8f0",
    antique_bronze: "#8c6239",
  };
  return map[presetId] ?? "#e5b3b3";
}
