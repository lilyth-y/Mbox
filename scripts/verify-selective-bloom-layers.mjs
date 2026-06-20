#!/usr/bin/env node
/** Selective bloom v2 — layer mask pipeline wired in host. */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const pipelineSrc = readFileSync(
  join(root, "apps/web/src/features/cube/microModules/selectiveBloomPipeline.ts"),
  "utf8"
);
const layersSrc = readFileSync(
  join(root, "apps/web/src/features/cube/microModules/selectiveBloomLayers.ts"),
  "utf8"
);
const moduleSrc = readFileSync(
  join(root, "apps/web/src/features/cube/microModules/selectiveBloomModule.ts"),
  "utf8"
);
const wireframeSrc = readFileSync(
  join(root, "apps/web/src/features/cube/microModules/hologramWireframeEdges.ts"),
  "utf8"
);
const sceneSrc = readFileSync(
  join(root, "apps/web/src/features/cube/presentationScene.ts"),
  "utf8"
);

assert(/createSelectiveBloomPipeline/.test(pipelineSrc), "selective bloom pipeline required");
assert(/darkenNonBloomedObject/.test(layersSrc), "layer darken pass required");
assert(/BLOOM_SCENE_LAYER/.test(layersSrc), "bloom layer constant required");
assert(/syncSelectiveBloomLayers/.test(moduleSrc), "module must sync bloom layers");
assert(/selectiveBloomTarget/.test(wireframeSrc), "holo edges tagged for bloom layer");
assert(/createHologramWireframeRig/.test(sceneSrc), "dual-layer hologram wireframe required");
assert(/HOLOGRAM_EDGE_BLOOM/.test(pipelineSrc), "centralized bloom tuning required");

console.log("verify-selective-bloom-layers: OK");
