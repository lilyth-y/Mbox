import type { ImageCenter, ImageFocus, SubjectBounds } from "../types";

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

function clampCropRect(
  width: number,
  height: number,
  sx: number,
  sy: number,
  size: number
): { sx: number; sy: number; size: number } {
  let cropSize = Math.min(size, Math.min(width, height));
  let cropSx = sx;
  let cropSy = sy;
  if (cropSx < 0) cropSx = 0;
  if (cropSy < 0) cropSy = 0;
  if (cropSx + cropSize > width) cropSx = width - cropSize;
  if (cropSy + cropSize > height) cropSy = height - cropSize;
  return { sx: cropSx, sy: cropSy, size: cropSize };
}

function boundsSpanUsable(bounds: SubjectBounds): boolean {
  const spanX = bounds.x1 - bounds.x0;
  const spanY = bounds.y1 - bounds.y0;
  return spanX >= 24 && spanY >= 16 && spanX * spanY >= 100;
}

/** Wide subject span — wedding couple / two people should stay in frame. */
export function isCoupleOrGroupBounds(bounds: SubjectBounds): boolean {
  const spanX = bounds.x1 - bounds.x0;
  const spanY = bounds.y1 - bounds.y0;
  return spanX >= 32 || (spanX >= 26 && spanY >= 40);
}

function computeBoundsInclusiveCrop(
  width: number,
  height: number,
  bounds: SubjectBounds,
  paddingRatio = 0.12
): { sx: number; sy: number; size: number } {
  const x0 = (bounds.x0 / 100) * width;
  const y0 = (bounds.y0 / 100) * height;
  const x1 = (bounds.x1 / 100) * width;
  const y1 = (bounds.y1 / 100) * height;
  const bw = x1 - x0;
  const bh = y1 - y0;
  const padX = bw * paddingRatio;
  const padY = bh * paddingRatio;
  const size = Math.min(Math.max(bw + padX * 2, bh + padY * 2), Math.min(width, height));
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  return clampCropRect(width, height, cx - size / 2, cy - size / 2, size);
}

export function computeCropBounds(
  width: number,
  height: number,
  center: { x: number; y: number },
  focus?: ImageFocus,
  subjectBounds?: SubjectBounds
): { sx: number; sy: number; size: number } {
  if (subjectBounds && boundsSpanUsable(subjectBounds) && isCoupleOrGroupBounds(subjectBounds)) {
    return computeBoundsInclusiveCrop(width, height, subjectBounds);
  }

  const focusedCenter = applyFocusCenter(center, focus);
  const centerX = (focusedCenter.x / 100) * width;
  const centerY = (focusedCenter.y / 100) * height;
  const size = Math.min(width, height);

  return clampCropRect(width, height, centerX - size / 2, centerY - size / 2, size);
}

function clampRectCrop(
  width: number,
  height: number,
  sx: number,
  sy: number,
  cropW: number,
  cropH: number
): { sx: number; sy: number; sw: number; sh: number } {
  let sw = Math.min(cropW, width);
  let sh = Math.min(cropH, height);
  let x = sx;
  let y = sy;
  if (x < 0) x = 0;
  if (y < 0) y = 0;
  if (x + sw > width) x = width - sw;
  if (y + sh > height) y = height - sh;
  return { sx: x, sy: y, sw, sh };
}

/** Cover crop rect with target width/height aspect (w/h). */
export function computeRectCropBounds(
  width: number,
  height: number,
  aspect: number,
  center: { x: number; y: number },
  focus?: ImageFocus,
  subjectBounds?: SubjectBounds
): { sx: number; sy: number; sw: number; sh: number } {
  const imageAspect = width / height;
  let cropW: number;
  let cropH: number;
  if (aspect >= imageAspect) {
    cropW = width;
    cropH = width / aspect;
  } else {
    cropH = height;
    cropW = height * aspect;
  }

  if (subjectBounds && boundsSpanUsable(subjectBounds) && isCoupleOrGroupBounds(subjectBounds)) {
    const x0 = (subjectBounds.x0 / 100) * width;
    const y0 = (subjectBounds.y0 / 100) * height;
    const x1 = (subjectBounds.x1 / 100) * width;
    const y1 = (subjectBounds.y1 / 100) * height;
    const bw = x1 - x0;
    const bh = y1 - y0;
    const pad = 0.14;
    const needW = bw * (1 + pad * 2);
    const needH = bh * (1 + pad * 2);
    const scale = Math.max(needW / cropW, needH / cropH, 1);
    cropW = Math.min(width, cropW * scale);
    cropH = Math.min(height, cropW / aspect);
    if (cropH > height) {
      cropH = height;
      cropW = height * aspect;
    }
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    return clampRectCrop(width, height, cx - cropW / 2, cy - cropH / 2, cropW, cropH);
  }

  const focusedCenter = applyFocusCenter(center, focus);
  const cx = (focusedCenter.x / 100) * width;
  const cy = (focusedCenter.y / 100) * height;
  return clampRectCrop(width, height, cx - cropW / 2, cy - cropH / 2, cropW, cropH);
}
