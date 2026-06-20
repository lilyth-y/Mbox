#!/usr/bin/env node
/**
 * Unit smoke: VoluMax layer vs true AI cutout readiness (no browser).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sharedDist = join(root, "packages/shared/dist/cubeEffectFramework.js");

const {
  isVoluMaxLayerReady,
  isVoluMaxCutoutReady,
  resolveVoluMaxForegroundKind,
} = await import(`file:///${sharedDist.replace(/\\/g, "/")}`);

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const png = "data:image/png;base64,abc";
const softLayer = {
  backgroundPlateUrl: png,
  subjectForegroundUrl: png,
  voluMaxForegroundKind: "soft_matte",
  preprocessMode: "volumax",
};
const aiLayer = {
  backgroundPlateUrl: png,
  subjectForegroundUrl: png,
  voluMaxForegroundKind: "ai_cutout",
  preprocessMode: "volumax",
};

assert(isVoluMaxLayerReady(softLayer), "soft matte still mounts dual layer");
assert(!isVoluMaxCutoutReady(softLayer), "soft matte is NOT true cutout");
assert(isVoluMaxCutoutReady(aiLayer), "ai_cutout is true cutout");
assert(resolveVoluMaxForegroundKind({ preprocessMode: "background_removed" }) === "ai_cutout");

const prepareSrc = readFileSync(
  join(root, "apps/web/src/features/processing/applyPresentationPrepare.ts"),
  "utf8"
);
assert(/wantsAiCutout[\s\S]*DEFAULT_CUBE_PRESENTATION_OPTIONS/.test(prepareSrc), "prepare defaults AI from shared");
assert(/forceRegenerateLayers/.test(prepareSrc), "prepare must support layer cache bust");

const weddingSrc = readFileSync(
  join(root, "apps/web/src/features/wedding-simple/WeddingSimpleDashboard.tsx"),
  "utf8"
);
assert(/useAiForegroundCutout:\s*cubeSettings\.voluMaxAiForegroundCutout/.test(weddingSrc), "wedding-simple passes AI flag");

const cutoutSrc = readFileSync(
  join(root, "apps/web/src/shared/lib/cutoutPresentation.ts"),
  "utf8"
);
assert(
  /voluMaxForegroundKind === "ai_cutout" && Boolean\(image\.backgroundPlateUrl\)/.test(cutoutSrc),
  "canUseDualLayerParallax must require ai_cutout kind"
);
assert(
  /export function canMountVoluMaxDualLayer/.test(cutoutSrc),
  "canMountVoluMaxDualLayer must exist"
);
assert(
  /matteTexture === fullTexture/.test(cutoutSrc),
  "must reject full-photo fallback as matte"
);

const sceneSrc = readFileSync(
  join(root, "apps/web/src/features/cube/presentationScene.ts"),
  "utf8"
);
assert(
  /canMountPlateBackedForeground/.test(sceneSrc),
  "presentationScene must gate plate+fg split with canMountPlateBackedForeground"
);
assert(
  /const plateSplit/.test(sceneSrc) && /canMountVoluMaxDualLayer/.test(sceneSrc),
  "dual-layer mount must require plate split and cutout readiness"
);
assert(
  /if \(mountDual && cutoutFg && plateTexture\)/.test(sceneSrc),
  "VoluMax mesh/disp must not mount when mountDual is false"
);
assert(
  /resolvePresentationFgTexture/.test(sceneSrc),
  "fg texture must load for every transparent matte slot"
);
assert(
  !/voluMaxDepthEnabled &&[\s\S]*canMountVoluMaxDualLayer/.test(sceneSrc),
  "depth toggle must not swap between full photo and VoluMax composite"
);
assert(
  !/pickVoluMaxForegroundTexture/.test(sceneSrc),
  "must not fall back to full photo inside VoluMax fg picker"
);

const dualLayerSrc = readFileSync(
  join(root, "apps/web/src/features/cube/cubeDualLayerParallaxMaterial.ts"),
  "utf8"
);
assert(
  /uTrustFgAlpha < 0\.5 && \(parallaxNorm/.test(dualLayerSrc),
  "AI cutout must skip independent fg/bg UV warp"
);
assert(
  /material\.side = THREE\.DoubleSide/.test(sceneSrc),
  "VoluMax coplanar stack uses DoubleSide"
);
assert(
  /resolveVoluMaxMountMode/.test(sceneSrc) && /isVoluMaxCutoutReady\(image\)/.test(sceneSrc),
  "AI cutout must mount via mesh split (not disp UV warp)"
);
assert(/isCutoutMatteFaceMaterial/.test(sceneSrc), "cutout matte detection must include ShaderMaterial");

console.log("verify-volumax-cutout-readiness: OK");
