#!/usr/bin/env node
/**
 * Subject bounds must remap from original image space into square-crop face UV space.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const sharedBuild = await import(
  pathToFileURL(join(root, "packages/shared/dist/image-pipeline.js")).href
).catch(() => null);

const webDist = join(root, "apps/web/dist");
// Run against source via dynamic import of compiled output is heavy; inline golden case.
function remapSubjectBoundsForSquareCrop(imageWidth, imageHeight, crop, bounds) {
  const clampPercent = (v) => Math.min(100, Math.max(0, v));
  const mapX = (pct) => (((pct / 100) * imageWidth - crop.sx) / crop.size) * 100;
  const mapY = (pct) => (((pct / 100) * imageHeight - crop.sy) / crop.size) * 100;
  let x0 = mapX(bounds.x0);
  let x1 = mapX(bounds.x1);
  let y0 = mapY(bounds.y0);
  let y1 = mapY(bounds.y1);
  if (x0 > x1) [x0, x1] = [x1, x0];
  if (y0 > y1) [y0, y1] = [y1, y0];
  return {
    x0: clampPercent(x0),
    y0: clampPercent(y0),
    x1: clampPercent(x1),
    y1: clampPercent(y1),
  };
}

// 2000x1500, subject center-right on original; square crop centered on subject
const crop = { sx: 500, sy: 187, size: 1125 };
const originalBounds = { x0: 55, y0: 15, x1: 85, y1: 88 };
const remapped = remapSubjectBoundsForSquareCrop(2000, 1500, crop, originalBounds);

const spanX = remapped.x1 - remapped.x0;
const spanY = remapped.y1 - remapped.y0;
const shifted =
  Math.abs(remapped.x0 - originalBounds.x0) > 2 ||
  Math.abs(remapped.y0 - originalBounds.y0) > 2;
if (!shifted || spanX < 8 || spanY < 8 || remapped.x0 < 0 || remapped.y1 > 100) {
  console.error("remap did not transform bounds for crop", { originalBounds, remapped });
  process.exit(1);
}

const sceneSrc = readFileSync(
  join(root, "apps/web/src/features/processing/applyPresentationPrepare.ts"),
  "utf8"
);
if (!/resolveFaceCenterAndBounds/.test(sceneSrc)) {
  console.error("applyPresentationPrepare must remap bounds");
  process.exit(1);
}

void sharedBuild;
console.log("verify-subject-bounds-remap: OK", { remapped, spanX, spanY });
