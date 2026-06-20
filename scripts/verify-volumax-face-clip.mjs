#!/usr/bin/env node
/**
 * KPI: VoluMax face bleed guards — UV clip wired, parallax offset within inset margin.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const sharedBuild = spawnSync(
  "npm",
  ["run", "build", "--workspace", "@mbox/shared"],
  { cwd: root, shell: true, encoding: "utf8" }
);
if (sharedBuild.status !== 0) {
  console.error(sharedBuild.stderr || sharedBuild.stdout);
  throw new Error("shared build failed");
}

const {
  maxVoluMaxParallaxOffsetWorld,
  maxVoluMaxUvWarpDelta,
  maxAllowedParallaxOffsetWorld,
  CUBE_FACE_UV_INSET,
} = await import(pathToFileURL(join(root, "packages/shared/dist/cube-export.js")).href);

const measuredOffset = maxVoluMaxParallaxOffsetWorld();
const measuredUvWarp = maxVoluMaxUvWarpDelta();
const allowedOffset = maxAllowedParallaxOffsetWorld();
const targetOffset = allowedOffset;
const targetUvWarp = CUBE_FACE_UV_INSET;

const sceneSrc = readFileSync(
  join(root, "apps/web/src/features/cube/presentationScene.ts"),
  "utf8"
);
const clipSrc = readFileSync(
  join(root, "apps/web/src/features/cube/cubeFaceClipMaterial.ts"),
  "utf8"
);
const dualSrc = readFileSync(
  join(root, "apps/web/src/features/cube/cubeDualLayerParallaxMaterial.ts"),
  "utf8"
);
const cubeCoreSrc = readFileSync(
  join(root, "packages/cube-core/src/index.ts"),
  "utf8"
);

assert(/uFaceUvInset/.test(clipSrc), "face clip shader must define uFaceUvInset");
assert(/createFaceClipMaterial/.test(sceneSrc), "presentationScene uses face clip");
assert(/mountVolumaxDispFace/.test(sceneSrc), "presentationScene mounts volumax_disp");
assert(/uFaceUvInset/.test(dualSrc), "dual-layer shader defines uFaceUvInset discard");
assert(/uUvWarpMax/.test(dualSrc), "dual-layer shader caps UV warp");
assert(/uTrustFgAlpha/.test(dualSrc), "dual-layer shader trusts PNG matte alpha");
assert(
  /rig\.mode === "volumax_disp"/.test(sceneSrc),
  "syncCubeFaceMotion handles volumax_disp"
);
assert(
  /resolveVoluMaxMountMode/.test(sceneSrc) && /mountVolumaxMeshFace/.test(sceneSrc),
  "presentationScene routes VoluMax cutout to mesh dual-layer"
);
assert(
  /isCutoutMatteFaceMaterial/.test(sceneSrc) && /rig\.mode === "volumax_mesh"/.test(sceneSrc),
  "AI cutout mesh uses Z-only parallax (no independent fg/bg UV warp)"
);
assert(
  /face\.bgMesh\.position\.set\(0, 0, BG_Z\)/.test(cubeCoreSrc),
  "cube-core keeps bg position fixed during parallax"
);
assert(
  /FG_Z \+ zPop/.test(cubeCoreSrc),
  "cube-core moves fg on Z only during parallax"
);

const offsetPass = measuredOffset <= targetOffset + 1e-6;
const uvWarpPass = measuredUvWarp <= targetUvWarp + 1e-6;

console.log(
  JSON.stringify(
    {
      kpi: "maxVoluMaxUvWarpDelta",
      target: `<= ${targetUvWarp.toFixed(4)}`,
      measured: measuredUvWarp,
      uvWarpPass,
      meshFallbackOffset: measuredOffset,
      clipWired: true,
    },
    null,
    2
  )
);

assert(uvWarpPass, `UV warp ${measuredUvWarp} > inset margin ${targetUvWarp}`);
assert(offsetPass, `mesh fallback offset ${measuredOffset} > allowed ${targetOffset}`);

const onDemand = spawnSync("node", ["scripts/verify-volumax-on-demand.mjs"], {
  cwd: root,
  encoding: "utf8",
});
if (onDemand.status !== 0) {
  console.error(onDemand.stdout || onDemand.stderr);
  throw new Error("verify-volumax-on-demand failed after clip changes");
}

console.log("verify-volumax-face-clip: OK");
