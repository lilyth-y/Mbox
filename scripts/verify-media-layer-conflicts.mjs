#!/usr/bin/env node
/**
 * Static checks: media layers and settings should not fight each other.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel) {
  return readFileSync(join(root, rel), "utf8");
}

let failed = 0;
const warn = [];

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  failed++;
}

function resolveWebBackdropUrl(assetPath) {
  const n = assetPath.replace(/^\/+/, "").replace(/\\/g, "/");
  if (n.startsWith("user-assets/")) {
    const rest = n.slice("user-assets/".length);
    return `/user-assets/${rest.split("/").map(encodeURIComponent).join("/")}`;
  }
  return `/backgrounds/${n.split("/").map(encodeURIComponent).join("/")}`;
}

// resolveCubeCoreBackdropUrl removed

const samples = [
  "배경동영상/rose.mp4",
  "user-assets/background/videos/rose.mp4",
  "user-assets/background/images/a.jpg",
];
for (const path of samples) {
  const web = resolveWebBackdropUrl(path);
  if (path.startsWith("user-assets/") && web.startsWith("/backgrounds/user-assets")) {
    fail(`Double /backgrounds prefix for ${path}`);
  }
}

const catalogTs = read("apps/web/src/shared/lib/backgroundAssetCatalog.ts");
if (!catalogTs.includes('normalized.startsWith("user-assets/")')) {
  fail("backgroundAssetCatalog missing user-assets branch");
}

const bgmTracks = read("apps/web/src/features/cube/bgm/bgmTracks.ts");
if (!bgmTracks.includes('trackId === "workspace"') || !bgmTracks.includes('trackId === "custom"')) {
  fail("resolveBgmSource missing mutually exclusive branches");
}

const viewportBackdrop = read("apps/web/src/features/cube/viewportBackdrop.ts");
if (!viewportBackdrop.includes("galaxyBackgroundActive")) {
  fail("viewportBackdrop missing galaxy priority gate");
}

const wedding = read("apps/web/src/features/wedding-simple/WeddingSimpleDashboard.tsx");
if (wedding.includes('backgroundPlateTheme !== "original"')) {
  fail("Wedding VoluMax auto-prepare still hardcodes original theme (conflicts with 배경 자동합성 테마)");
}
if (!wedding.includes("backgroundPlateTheme: backgroundTheme")) {
  fail("Wedding VoluMax auto-prepare should use backgroundTheme state");
}
if (!wedding.includes("mountViewportBackdrop") || !wedding.includes("createPresentationScene")) {
  fail("Wedding must use mountViewportBackdrop + presentationScene (not duplicate cube-core backdrop)");
}

const mediaSection = read("apps/web/src/features/cube/media/MediaSection.tsx");
if (!mediaSection.includes("bgmWorkspacePath: null") || !mediaSection.includes("bgmCustomUrl: null")) {
  warn.push("MediaSection may not clear all BGM sources on switch");
}
if (!mediaSection.includes("MediaComboPresets") || !mediaSection.includes("MediaOverlapHint")) {
  fail("MediaSection missing combo presets or overlap hints");
}
const voluMaxHeader = read("apps/web/src/features/cube/media/VoluMaxStatusHeader.tsx");
if (!mediaSection.includes("viewportBackdropOpacity")) {
  fail("MediaSection missing viewportBackdropOpacity slider");
}
if (!read("apps/web/src/features/cube/viewportBackdrop.ts").includes("setOpacity")) {
  fail("viewportBackdrop missing setOpacity for backdrop dimming");
}

const builder = read("scripts/lib/background-catalog-builder.mjs");
const bgCatalog = read("scripts/generate-background-catalog.mjs");
if (!bgCatalog.includes("buildBackgroundCatalogCollections")) {
  fail("generate-background-catalog must use shared builder (user collections)");
}

if (warn.length) {
  for (const w of warn) console.warn(`WARN: ${w}`);
}

const compositePs1 = read("scripts/composite_rose_cube_video.ps1");
if (!compositePs1.includes("Resolve-DefaultBgm") || !compositePs1.includes("piano-slideshow.mp3")) {
  fail("composite script missing default BGM resolver");
}
console.log("verify-media-layer-conflicts: PASS");
