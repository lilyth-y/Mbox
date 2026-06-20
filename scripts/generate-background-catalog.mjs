#!/usr/bin/env node

/**

 * Scans data/background (+ user-assets backgrounds) and writes catalog.json.

 * Prefer `npm run sync:user-assets` when BGM catalog should refresh too.

 */

import { writeFileSync } from "node:fs";

import { join, dirname } from "node:path";

import { fileURLToPath } from "node:url";

import { buildBackgroundCatalogCollections } from "./lib/background-catalog-builder.mjs";



const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const bgRoot = join(root, "data", "background");

const userRoot = join(root, "data", "user-assets");



const collections = buildBackgroundCatalogCollections(bgRoot, userRoot);



const catalog = {

  version: 2,

  generatedAt: new Date().toISOString(),

  collections,

};



const outPath = join(bgRoot, "catalog.json");

writeFileSync(outPath, JSON.stringify(catalog, null, 2), "utf8");



const imageCount = collections.reduce(

  (n, c) => n + c.items.filter((i) => i.kind === "image").length,

  0

);

const videoCount = collections.reduce(

  (n, c) => n + c.items.filter((i) => i.kind === "video").length,

  0

);

const userCount = collections.filter((c) => c.id.startsWith("사용자_")).length;



console.log(

  `Wrote ${outPath} (${collections.length} collections, ${imageCount} images, ${videoCount} videos, ${userCount} user collections)`

);

