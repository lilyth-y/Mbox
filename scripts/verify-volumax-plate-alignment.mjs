#!/usr/bin/env node
/**
 * VoluMax plate must use the same center/focus crop as cropImage / AI matte.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel) {
  return readFileSync(join(root, rel), "utf8");
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const plateSrc = read("apps/web/src/shared/lib/backgroundPlate.ts");
assert(/drawImageToPlateSquare/.test(plateSrc), "drawImageToPlateSquare helper required");
assert(/computeCropBounds/.test(plateSrc), "plate must use computeCropBounds");
assert(/center\?: ImageCenter/.test(plateSrc), "BackgroundPlateOptions.center required");

const prepareSrc = read("apps/web/src/features/processing/applyPresentationPrepare.ts");
assert(
  (prepareSrc.match(/createBackgroundPlateDataUrl\([\s\S]*?center: image\.center/g) ?? []).length >= 3,
  "applyPresentationPrepare must pass center/focus to all plate builds"
);

const removalSrc = read("apps/web/src/features/processing/applyBackgroundRemoval.ts");
assert(/center: image\.center/.test(removalSrc), "applyBackgroundRemoval must align plate crop");

const weddingApp = read("apps/web/public/wedding-simple/app.js");
assert(/drawImageToPlateSquare/.test(weddingApp), "wedding-simple reference still uses aligned plate draw");

console.log("verify-volumax-plate-alignment: OK");
