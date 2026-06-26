#!/usr/bin/env node
/**
 * Numerical closure check for inner jewel-cube photo faces (six planes).
 * Pure math — no Babylon imports (runs under node directly).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function ok(name, pass, detail = "") {
  console.log(`[${pass ? "OK" : "FAIL"}] ${name}${detail ? `: ${detail}` : ""}`);
  if (!pass) process.exitCode = 1;
}

const OUTER_SIZE = 1.85;
const BRILLIANT_CUT_FACE_INSET_RATIO = 0.084;
const CUBE_PHOTO_FACE_DEPTH_MUL = 0.965;
const LEGACY_MARGIN = 0.996;

const meshSrcEarly = readFileSync(
  join(root, "apps/web/src/features/showcase/babylon/jewelPhotoInnerMesh.ts"),
  "utf8"
);
const overlapMatch = meshSrcEarly.match(/CUBE_PHOTO_FACE_SEAM_OVERLAP = ([\d.]+)/);
const CUBE_PHOTO_FACE_SEAM_OVERLAP = overlapMatch ? Number(overlapMatch[1]) : 1.008;

function getBrilliantCutFlatSpan(outerSize, faceInsetRatio = BRILLIANT_CUT_FACE_INSET_RATIO) {
  const w = outerSize / 2;
  return 2 * (w - outerSize * faceInsetRatio);
}

function getCubePhotoCavityMetrics() {
  const outerSpan = OUTER_SIZE;
  const flatSpan = getBrilliantCutFlatSpan(outerSpan);
  const flatHalf = flatSpan * 0.5;
  const faceHalf = flatHalf * CUBE_PHOTO_FACE_DEPTH_MUL;
  const edgeSize = 2 * faceHalf * CUBE_PHOTO_FACE_SEAM_OVERLAP;
  return { edgeSize, faceHalf, flatSpan };
}

function radialGap(faceHalf, edgeSize) {
  return faceHalf - edgeSize * 0.5;
}

const meshSrc = meshSrcEarly;
const coreSrc = readFileSync(
  join(root, "apps/web/src/features/showcase/babylon/jewelPhotoCore.ts"),
  "utf8"
);
ok(
  "cube layout uses six face planes (no welded box)",
  /createInnerPhotoCubeFaceMeshes/.test(coreSrc) && !/createInnerPhotoCubeMesh\(/.test(coreSrc)
);
ok(
  "source uses seam overlap formula",
  /CUBE_PHOTO_FACE_SEAM_OVERLAP/.test(meshSrc) &&
    /edgeSize = 2 \* faceHalf \* CUBE_PHOTO_FACE_SEAM_OVERLAP/.test(meshSrc)
);
ok(
  "legacy margin removed",
  !/CUBE_PHOTO_FACE_MARGIN/.test(meshSrc)
);

const shaderSrc = readFileSync(
  join(root, "apps/web/src/features/showcase/babylon/shaders/jewelInnerPhotoShader.ts"),
  "utf8"
);
ok(
  "cube faces skip corner silhouette discard",
  /uCubeFace < 0\.5/.test(shaderSrc) && /applySilhouetteDiscard/.test(shaderSrc)
);

const { edgeSize, faceHalf, flatSpan } = getCubePhotoCavityMetrics();
const half = edgeSize * 0.5;
const gap = radialGap(faceHalf, edgeSize);
const jointCoverage = half / faceHalf;

ok("faceHalf > 0", faceHalf > 0, String(faceHalf));
ok("edgeSize > 2·faceHalf (micro overlap)", edgeSize > 2 * faceHalf, `edge=${edgeSize.toFixed(6)}`);
ok("radial gap ≤ 0 (planes meet or overlap)", gap <= 1e-9, `gap=${gap.toExponential(3)}`);
ok("joint coverage ≥ 1", jointCoverage >= 1 - 1e-9, String(jointCoverage));

const legacyEdge = flatSpan * CUBE_PHOTO_FACE_DEPTH_MUL * LEGACY_MARGIN;
const legacyGap = faceHalf - legacyEdge * 0.5;
ok("legacy 0.996 margin left gaps", legacyGap > 0.001, `legacy radial gap=${legacyGap.toFixed(5)}`);

if (process.exitCode) {
  process.exit(1);
}
console.log("verify-inner-cube-face-seams: OK");
