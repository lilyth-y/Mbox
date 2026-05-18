#!/usr/bin/env node
/**
 * Ensures pinned @imgly/background-removal versions stay in sync across the monorepo.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const webPkg = JSON.parse(readFileSync(join(root, "apps/web/package.json"), "utf8"));
const sharedSrc = readFileSync(
  join(root, "packages/shared/src/background-removal.ts"),
  "utf8"
);

const imgly = webPkg.dependencies["@imgly/background-removal"];
const ort = webPkg.dependencies["onnxruntime-web"];
const matchVersion = sharedSrc.match(
  /IMGLY_BACKGROUND_REMOVAL_VERSION = "([^"]+)"/
);
const sharedVersion = matchVersion?.[1];

let failed = false;

if (!imgly || imgly.startsWith("^") || imgly.startsWith("~")) {
  console.error("FAIL: apps/web must pin @imgly/background-removal to an exact version (no ^/~).");
  failed = true;
}

if (imgly !== sharedVersion) {
  console.error(
    `FAIL: apps/web @imgly/background-removal (${imgly}) != shared constant (${sharedVersion})`
  );
  failed = true;
}

if (!ort || ort.startsWith("^")) {
  console.error("FAIL: apps/web must pin onnxruntime-web to an exact version.");
  failed = true;
}

if (failed) {
  process.exit(1);
}

console.log(`OK: imgly ${imgly}, onnxruntime-web ${ort}, CDN path .../${sharedVersion}/dist/`);
