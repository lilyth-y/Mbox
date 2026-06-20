#!/usr/bin/env node
/**
 * VoluMax must keep the photo background visible — never mount matte-only faces.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sharedDist = join(root, "packages/shared/dist/cubeEffectFramework.js");

const { resolveCubeFaceDisplayUrl, isTransparentMatteDataUrl } = await import(
  `file:///${sharedDist.replace(/\\/g, "/")}`
);

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const matte = "data:image/png;base64,abc";
const plate = "data:image/jpeg;base64,plate";
const composite = "data:image/png;base64,composite";

assert(
  resolveCubeFaceDisplayUrl({ url: "data:image/jpeg;base64,face" }) === "data:image/jpeg;base64,face",
  "jpeg face url unchanged"
);
assert(
  resolveCubeFaceDisplayUrl({
    url: matte,
    subjectForegroundUrl: matte,
    preparedUrl: "data:image/jpeg;base64,orig",
  }) === "data:image/jpeg;base64,orig",
  "legacy matte url falls back to preparedUrl"
);
assert(
  resolveCubeFaceDisplayUrl({
    url: matte,
    subjectForegroundUrl: matte,
    faceCompositeUrl: composite,
  }) === composite,
  "legacy matte url uses faceCompositeUrl"
);
assert(
  resolveCubeFaceDisplayUrl({
    url: matte,
    backgroundPlateUrl: plate,
  }) === plate,
  "legacy matte url uses background plate"
);
assert(
  resolveCubeFaceDisplayUrl({
    url: matte,
    originalUrl: "data:image/jpeg;base64,orig",
  }) === "data:image/jpeg;base64,orig",
  "legacy matte url falls back to originalUrl"
);

const removalSrc = readFileSync(
  join(root, "apps/web/src/features/processing/applyBackgroundRemoval.ts"),
  "utf8"
);
assert(/url: faceSquareUrl/.test(removalSrc), "background removal must keep full face url");

const sceneSrc = readFileSync(
  join(root, "apps/web/src/features/cube/presentationScene.ts"),
  "utf8"
);
assert(
  !/mountFramedFlatFace\(rig, matteTexture/.test(sceneSrc),
  "must not mount matte-only flat face"
);
assert(
  /mountVolumaxMeshFace\(rig, cutoutFg, plateTexture/.test(sceneSrc),
  "cutout fallback must mount plate + matte mesh"
);
assert(
  /rig\.mode === "volumax_mesh"[\s\S]*rig\.bgMesh\.visible = true/.test(sceneSrc) ||
    /rig\.bgMesh\.visible = true/.test(sceneSrc),
  "volumax mesh faces must keep bg plate visible"
);
assert(
  /canMountPlateBackedForeground/.test(
    readFileSync(join(root, "apps/web/src/shared/lib/cutoutPresentation.ts"), "utf8")
  ),
  "plate-backed foreground mount helper must exist"
);

const texSrc = readFileSync(
  join(root, "apps/web/src/features/cube/presentationTextures.ts"),
  "utf8"
);
assert(/resolveCubeFaceDisplayUrl/.test(texSrc), "texture loader must use display url resolver");

console.log("verify-volumax-face-background: OK");
