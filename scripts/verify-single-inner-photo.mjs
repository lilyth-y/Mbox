#!/usr/bin/env node
/**
 * Regression: singleInnerPhoto must not disable the only photo layer after upload.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel) {
  return readFileSync(join(root, rel), "utf8");
}

function testProfileFlag() {
  const src = read("apps/web/src/features/showcase/showcaseGpuProfile.ts");
  assert.match(src, /singleInnerPhoto: true/, "singleInnerPhoto default on");
  assert.match(src, /usesJewelPhotoMorphTwin/, "morph twin helper exported");
}

function testMorphGuardsAliasedLayer() {
  const src = read("apps/web/src/features/showcase/babylon/jewelCubePhotoMorph.ts");
  assert.match(src, /jewelRigUsesPhotoMorphTwin/, "twin detection");
  assert.match(src, /disableMorphTwinLayers/, "safe twin disable");
  assert.doesNotMatch(
    src,
    /commitHoloToLayerA[\s\S]*setJewelPhotoCoreLayerEnabled\(rig\.bgLayerB, false\)/,
    "instant morph must not blindly disable bgLayerB after commit"
  );
}

function testFactoryAliasesLayerB() {
  const src = read("apps/web/src/features/showcase/babylon/jewelCubeFactory.ts");
  assert.match(src, /resolvedLayerB = layerB \?\? layerA/, "bgLayerB aliases layerA when no twin");
  assert.match(src, /usesJewelPhotoMorphTwin/, "spawn respects morph twin flag");
}

function testUploadAuditHook() {
  const dashboard = read("apps/web/src/features/showcase/ShowcaseDashboard.tsx");
  assert.match(dashboard, /__MBOX_SHOWCASE_UPLOAD_AUDIT__/, "upload audit hook");
  const attach = read("apps/web/src/features/showcase/showcasePhotoAttachment.ts");
  assert.match(attach, /auditShowcasePhotoAttachment/, "upload attachment audit");
}

function testCubeUsesCustomPhotoShader() {
  const bridge = read("apps/web/src/features/showcase/babylon/jewelPhotoMaterialBridge.ts");
  assert.match(bridge, /options\.cubeFace/, "cube layout opts into custom shader");
  assert.match(
    bridge,
    /if \(options\.cubeFace\)[\s\S]*return false/,
    "cube layout skips StandardMaterial preview"
  );
}

function testNoSolidInnerBox() {
  const attach = read("apps/web/src/features/showcase/showcasePhotoAttachment.ts");
  assert.match(attach, /no_solid_inner_box/, "upload audit rejects welded inner box");
  assert.match(attach, /no_heart_front_plate/, "upload audit rejects heart front plate");
}

function testHeartDualTable() {
  const core = read("apps/web/src/features/showcase/babylon/jewelPhotoInnerMesh.ts");
  const mesh = read("apps/web/src/features/showcase/babylon/jewelPhotoInnerMesh.ts");
  assert.match(core, /createInnerPhotoHeartTableMeshes/, "heart uses recessed table meshes");
  assert.match(mesh, /createHeartTablePhotoMesh/, "heart table photo mesh");
  assert.match(core, /`\$\{name\}-back`/, "heart back table");
}

function testSilhouetteUsesCustomShader() {
  const bridge = read("apps/web/src/features/showcase/babylon/jewelPhotoMaterialBridge.ts");
  assert.match(bridge, /silhouetteKind/, "non-rect silhouettes opt into custom shader");
}

function testJewelSpawnTokenGuards() {
  const token = read("apps/web/src/features/showcase/pipeline/showcaseJewelSpawnToken.ts");
  const reveal = read("apps/web/src/features/showcase/pipeline/stages/revealStage.ts");
  const director = read("apps/web/src/features/showcase/pipeline/showcasePipelineDirector.ts");
  assert.match(token, /jewelSpawnGeneration/, "spawn generation key");
  assert.match(reveal, /isJewelSpawnTokenValid/, "reveal validates spawn token");
  assert.match(reveal, /disposeStaleRevealJewelRig/, "stale rigs disposed");
  assert.match(director, /jewelSpawnGeneration/, "reset bumps spawn generation");
}

function testJewelMeshLeakAudit() {
  const audit = read("apps/web/src/features/showcase/showcaseJewelMeshAudit.ts");
  const dashboard = read("apps/web/src/features/showcase/ShowcaseDashboard.tsx");
  assert.match(audit, /single_collider/, "collider leak check");
  assert.match(dashboard, /__MBOX_SHOWCASE_MESH_AUDIT__/, "mesh audit hook");
}

function testStabilityGuards() {
  const dashboard = read("apps/web/src/features/showcase/ShowcaseDashboard.tsx");
  const panel = read("apps/web/src/features/showcase/ShowcaseCatalogPanel.tsx");
  const companion = read("apps/web/src/features/showcase/useShowcaseChromeCompanion.ts");
  assert.match(dashboard, /JEWEL_PROFILE_UPDATE_DEBOUNCE_MS/, "jewel profile debounce");
  assert.match(dashboard, /scheduleJewelProfileUpdate/, "shared jewel profile scheduler");
  assert.match(dashboard, /gpuPreviewLocked/, "shell blocks profile until chrome live");
  assert.match(panel, /gpuPreviewLocked/, "catalog gpu lock prop");
  assert.match(panel, /profileLocked/, "shape/layout/frame lock");
  assert.match(companion, /setTimeout\(\(\) => \{\s*publishCurrentState/, "debounced companion publish");
}

const checks = [
  ["singleInnerPhoto profile", testProfileFlag],
  ["morph aliased-layer guard", testMorphGuardsAliasedLayer],
  ["factory layer alias", testFactoryAliasesLayerB],
  ["upload audit hook", testUploadAuditHook],
  ["cube custom photo shader", testCubeUsesCustomPhotoShader],
  ["no solid inner box audit", testNoSolidInnerBox],
  ["heart dual table", testHeartDualTable],
  ["silhouette custom shader", testSilhouetteUsesCustomShader],
  ["jewel spawn token guards", testJewelSpawnTokenGuards],
  ["jewel mesh leak audit", testJewelMeshLeakAudit],
  ["stability guards", testStabilityGuards],
];

let failed = 0;
for (const [label, fn] of checks) {
  try {
    fn();
    console.log(`✓ ${label}`);
  } catch (error) {
    failed += 1;
    console.error(`✗ ${label}:`, error instanceof Error ? error.message : error);
  }
}

if (failed) {
  process.exit(1);
}
console.log("\nverify-single-inner-photo: OK");
