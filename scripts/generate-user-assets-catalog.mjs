#!/usr/bin/env node

/**

 * Scans data/user-assets and writes BGM catalog + merges background into data/background/catalog.json

 */

import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";

import { join, dirname, extname } from "node:path";

import { fileURLToPath } from "node:url";

import { buildBackgroundCatalogCollections } from "./lib/background-catalog-builder.mjs";



const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const userRoot = join(root, "data", "user-assets");

const bgmDir = join(userRoot, "bgm");

const bgRoot = join(root, "data", "background");



const AUDIO_EXT = new Set([".mp3", ".m4a", ".wav", ".aac"]);



mkdirSync(bgmDir, { recursive: true });

mkdirSync(join(userRoot, "background", "images"), { recursive: true });

mkdirSync(join(userRoot, "background", "videos"), { recursive: true });



function listBgmFiles(dir) {

  if (!existsSync(dir)) return [];

  return readdirSync(dir)

    .filter((name) => name !== "catalog.json" && AUDIO_EXT.has(extname(name).toLowerCase()))

    .sort((a, b) => a.localeCompare(b, "ko"));

}



const bgmFiles = listBgmFiles(bgmDir);

const bgmCatalog = {

  version: 1,

  generatedAt: new Date().toISOString(),

  root: "data/user-assets/bgm",

  items: bgmFiles.map((file) => ({

    file,

    label: file.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " "),

    publicPath: `bgm/${file}`,

  })),

};

writeFileSync(join(bgmDir, "catalog.json"), JSON.stringify(bgmCatalog, null, 2), "utf8");



const collections = buildBackgroundCatalogCollections(bgRoot, userRoot);

const userBgCount = collections

  .filter((c) => c.id.startsWith("사용자_"))

  .reduce((n, c) => n + c.items.length, 0);



const catalog = {

  version: 2,

  generatedAt: new Date().toISOString(),

  collections,

};

writeFileSync(join(bgRoot, "catalog.json"), JSON.stringify(catalog, null, 2), "utf8");



console.log(`User assets: ${bgmFiles.length} BGM, ${userBgCount} background`);

console.log(`Wrote ${join(bgmDir, "catalog.json")}`);

console.log(`Wrote ${join(bgRoot, "catalog.json")} (${collections.length} collections)`);

