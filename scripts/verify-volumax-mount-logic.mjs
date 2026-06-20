#!/usr/bin/env node
/**
 * VoluMax mount decisions + presentationScene wiring (no browser).
 */
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const tmp = join(root, "scripts", ".verify-volumax-mount-logic.ts");

const script = `import * as THREE from "three";
import {
  canMountPlateBackedForeground,
  canMountVoluMaxDualLayer,
} from "../apps/web/src/shared/lib/cutoutPresentation.ts";
import { isVoluMaxCutoutReady } from "@mbox/shared";

const png = "data:image/png;base64,abc";
const platePng = "data:image/png;base64,plate";
const plate = new THREE.Texture();
const matte = new THREE.Texture();
const full = new THREE.Texture();

const aiImage = {
  backgroundPlateUrl: platePng,
  subjectForegroundUrl: png,
  voluMaxForegroundKind: "ai_cutout" as const,
  preprocessMode: "volumax" as const,
  url: "data:image/jpeg;base64,xyz",
};

const softImage = {
  ...aiImage,
  voluMaxForegroundKind: "soft_matte" as const,
};

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

assert(isVoluMaxCutoutReady(aiImage), "ai cutout ready");
assert(!isVoluMaxCutoutReady(softImage), "soft matte not cutout");
assert(canMountPlateBackedForeground(aiImage), "plate+fg url");
assert(
  !canMountPlateBackedForeground({
    ...aiImage,
    backgroundPlateUrl: aiImage.url,
  }),
  "reject composite url as plate"
);
assert(
  canMountVoluMaxDualLayer(aiImage, matte, full, plate),
  "dual layer when matte !== full"
);
assert(
  !canMountVoluMaxDualLayer(aiImage, full, full, plate),
  "reject full photo as matte"
);
assert(
  !canMountVoluMaxDualLayer(softImage, matte, full, plate),
  "soft matte no dual mount"
);

console.log("verify-volumax-mount-logic: OK");
`;

writeFileSync(tmp, script, "utf8");
const result = spawnSync("npx", ["tsx", tmp], { cwd: root, stdio: "inherit", shell: true });
try {
  unlinkSync(tmp);
} catch {
  /* ignore */
}

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

const sceneSrc = readFileSync(
  join(root, "apps/web/src/features/cube/presentationScene.ts"),
  "utf8"
);
const checks = [
  [/material\.side = THREE\.DoubleSide/.test(sceneSrc), "DoubleSide on VoluMax materials"],
  [/rig\.fgMesh\.visible = true/.test(sceneSrc), "fgMesh visible on mount"],
  [/resolvePresentationFgTexture/.test(sceneSrc), "fg matte resolver wired"],
  [/sourceIndex/.test(sceneSrc), "texture source index for layer arrays"],
  [/applyCutoutCoplanarStack/.test(sceneSrc), "coplanar cutout stack"],
];

for (const [ok, msg] of checks) {
  if (!ok) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
}
console.log("verify-volumax-mount-logic: scene wiring OK");
