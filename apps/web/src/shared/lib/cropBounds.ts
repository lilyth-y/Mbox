import type { ImageCenter, ImageFocus } from "../types";

const FOCUS_CENTER_OFFSETS: Record<ImageFocus["centering"], { x: number; y: number }> = {
  centered: { x: 0, y: 0 },
  rule_of_thirds: { x: 0, y: -4 },
  offset: { x: 0, y: 0 },
  edge_weighted: { x: 0, y: 0 },
};

export function applyFocusCenter(center: ImageCenter, focus?: ImageFocus): ImageCenter {
  if (!focus?.onPrimarySubject) {
    return center;
  }

  const offset = FOCUS_CENTER_OFFSETS[focus.centering];
  return {
    x: Math.min(100, Math.max(0, center.x + offset.x)),
    y: Math.min(100, Math.max(0, center.y + offset.y)),
  };
}

export function computeCropBounds(
  width: number,
  height: number,
  center: { x: number; y: number },
  focus?: ImageFocus
): { sx: number; sy: number; size: number } {
  const focusedCenter = applyFocusCenter(center, focus);
  const centerX = (focusedCenter.x / 100) * width;
  const centerY = (focusedCenter.y / 100) * height;
  let size = Math.min(width, height);

  if (focus?.onPrimarySubject) {
    size *= 0.9;
  }

  let sx = centerX - size / 2;
  let sy = centerY - size / 2;

  if (sx < 0) sx = 0;
  if (sy < 0) sy = 0;
  if (sx + size > width) sx = width - size;
  if (sy + size > height) sy = height - size;

  return { sx, sy, size };
}
