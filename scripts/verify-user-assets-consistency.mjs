#!/usr/bin/env node
/**
 * Tier-1 smoke: catalog paths vs URL resolver rules (no server required).
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function resolveWebUrl(assetPath) {
  const normalized = assetPath.replace(/^\/+/, "").replace(/\\/g, "/");
  if (normalized.startsWith("user-assets/")) {
    const rest = normalized.slice("user-assets/".length);
    return `/user-assets/${rest.split("/").map(encodeURIComponent).join("/")}`;
  }
  return `/backgrounds/${normalized.split("/").map(encodeURIComponent).join("/")}`;
}

function resolveCubeCoreUrl(assetPath) {
  const normalized = assetPath.replace(/^\/+/, "").replace(/\\/g, "/");
  if (normalized.startsWith("user-assets/")) {
    const rest = normalized.slice("user-assets/".length);
    return `/user-assets/${rest.split("/").map(encodeURIComponent).join("/")}`;
  }
  return `/backgrounds/${normalized.split("/").map(encodeURIComponent).join("/")}`;
}

function resolveCatalogPath(collectionId, file) {
  if (collectionId.startsWith("사용자_")) return `user-assets/${file}`;
  return `${collectionId}/${file}`;
}

const bgCatalog = JSON.parse(readFileSync(join(root, "data/background/catalog.json"), "utf8"));
const cubeBundle = readFileSync(
  join(root, "apps/web/public/wedding-simple/cube-core.js"),
  "utf8"
);

let failed = 0;

const userCollections = bgCatalog.collections.filter((c) => c.id.startsWith("사용자_"));
if (userCollections.length === 0) {
  console.log("SKIP: no 사용자_* collections (drop files in data/user-assets/background/)");
} else {
  for (const col of userCollections) {
    for (const item of col.items) {
      const assetPath = resolveCatalogPath(col.id, item.file);
      const web = resolveWebUrl(assetPath);
      const cube = resolveCubeCoreUrl(assetPath);
      if (!web.startsWith("/user-assets/")) {
        console.error(`FAIL web URL for ${assetPath}: ${web}`);
        failed++;
      }
      if (!cube.startsWith("/user-assets/")) {
        console.error(`FAIL cube URL for ${assetPath}: ${cube}`);
        failed++;
      }
      if (web.includes("/backgrounds/user-assets")) {
        console.error(`FAIL double prefix: ${web}`);
        failed++;
      }
    }
  }
}

if (!cubeBundle.includes("user-assets/")) {
  console.error("FAIL: cube-core.js bundle missing user-assets URL branch (rebuild @mbox/cube-core)");
  failed++;
}

// sync:background-catalog must preserve user collections when present
import { buildBackgroundCatalogCollections } from "./lib/background-catalog-builder.mjs";
const rebuilt = buildBackgroundCatalogCollections(
  join(root, "data/background"),
  join(root, "data/user-assets")
);
const rebuiltUser = rebuilt.filter((c) => c.id.startsWith("사용자_")).length;
const catalogUser = bgCatalog.collections.filter((c) => c.id.startsWith("사용자_")).length;
if (rebuiltUser !== catalogUser) {
  console.error(`FAIL: builder user collections ${rebuiltUser} vs catalog ${catalogUser}`);
  failed++;
}

if (failed > 0) {
  console.error(`verify-user-assets-consistency: ${failed} failure(s)`);
  process.exit(1);
}

console.log("verify-user-assets-consistency: PASS");
