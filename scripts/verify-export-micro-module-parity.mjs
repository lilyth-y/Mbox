#!/usr/bin/env node
/** Ensures MP4 export resizes micro-module post FX (bloom) to match preview/export layout. */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const cubeViewSrc = readFileSync(
  join(root, "apps/web/src/features/cube/CubeView.tsx"),
  "utf8"
);
const hostSrc = readFileSync(
  join(root, "apps/web/src/features/cube/microModules/presentationMicroModuleHost.ts"),
  "utf8"
);

assert(/syncLayout\(/.test(hostSrc), "host must expose syncLayout for export/preview parity");
assert(
  /applyExportRendererSize[\s\S]*syncLayout\(exportSize/.test(cubeViewSrc),
  "CubeView export must syncLayout after applyExportRendererSize"
);
assert(
  /restoreRendererLayout[\s\S]*syncLayout\([\s\S]*previewMicroModuleLayoutSize/.test(cubeViewSrc),
  "CubeView export finally must restore micro-module layout"
);
assert(
  /microModuleHost\.render\(/.test(cubeViewSrc),
  "CubeView animate loop must render via micro-module host (includes export frames)"
);

console.log("verify-export-micro-module-parity: OK");
