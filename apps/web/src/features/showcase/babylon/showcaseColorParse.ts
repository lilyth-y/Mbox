import { Color3 } from "@babylonjs/core/Maths/math.color";

export function parseHexColor3(hex: string, fallback: Color3): Color3 {
  const normalized = hex.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    return fallback.clone();
  }
  const value = Number.parseInt(normalized, 16);
  return new Color3(
    ((value >> 16) & 255) / 255,
    ((value >> 8) & 255) / 255,
    (value & 255) / 255
  );
}

export function color3ToHex(color: Color3): string {
  const toByte = (channel: number) =>
    Math.max(0, Math.min(255, Math.round(channel * 255)))
      .toString(16)
      .padStart(2, "0");
  return `#${toByte(color.r)}${toByte(color.g)}${toByte(color.b)}`;
}
