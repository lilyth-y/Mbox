#!/usr/bin/env node
/**
 * Smoke: cube face mounts match fanMotion.js FACE_ROTATIONS; borderless = tight cube.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const layoutSrc = readFileSync(
  join(root, "apps/web/src/features/cube/cubeFaceLayout.ts"),
  "utf8"
);
const sceneSrc = readFileSync(
  join(root, "apps/web/src/features/cube/presentationScene.ts"),
  "utf8"
);
const seqSrc = readFileSync(
  join(root, "apps/web/src/features/cube/cubeSequence.ts"),
  "utf8"
);
const fanRef = readFileSync(
  join(root, "apps/web/public/wedding-simple/fanMotion.js"),
  "utf8"
);
const weddingSrc = readFileSync(
  join(root, "apps/web/src/features/wedding-simple/WeddingSimpleDashboard.tsx"),
  "utf8"
);

assert(/getFaceRotation/.test(layoutSrc), "cubeFaceLayout must use getFaceRotation");
assert(
  /planeSize:\s*CUBE_EDGE_LENGTH \* CUBE_FRAME_MESH_SCALE/.test(layoutSrc) ||
    /const planeSize = CUBE_EDGE_LENGTH \* CUBE_FRAME_MESH_SCALE/.test(layoutSrc),
  "framed plane must match RoundedBox shell face opening"
);
assert(
  /planeSize:\s*CUBE_EDGE_LENGTH,\s*faceHalf:\s*halfEdge,\s*uvInset:\s*CUBE_FACE_UV_INSET/.test(
    layoutSrc
  ),
  "borderless plane must be exact cube edge with UV inset to prevent neighbor bleed"
);
const frameGlsl = readFileSync(
  join(root, "apps/web/src/features/cube/photoFrameGlsl.ts"),
  "utf8"
);
assert(/uShellFrameMode/.test(frameGlsl), "photoFrameGlsl must support 3D shell frame mode");
assert(/applyShellFrameModeToMesh/.test(sceneSrc), "presentationScene must apply shell frame mode");
assert(
  /faceHalf:\s*innerHalf/.test(layoutSrc) ||
    /faceHalf:\s*planeSize\s*\/\s*2/.test(layoutSrc),
  "framed faceHalf must use inner cube half-edge (shell outside) so photos are not swallowed"
);
assert(/FRAMED_FACE_PHOTO_Z_EXTRA/.test(layoutSrc), "framed faces need extra local photo Z");
assert(/backPlateMesh\.visible = false/.test(sceneSrc), "back-plate must stay hidden (shell draws frame)");
assert(/faceBgZ:/.test(layoutSrc), "layout metrics must include faceBgZ");
assert(/CUBE_FRAME_MESH_SCALE/.test(sceneSrc), "presentationScene must share CUBE_FRAME_MESH_SCALE");
assert(/setCubeSizeScale/.test(sceneSrc), "presentationScene must expose setCubeSizeScale");
assert(/cubeSizeGroup/.test(sceneSrc), "cube mesh scale must use dedicated size group");
assert(
  /RoundedBoxGeometry\(CUBE_EDGE_LENGTH,\s*CUBE_EDGE_LENGTH,\s*CUBE_EDGE_LENGTH/.test(sceneSrc),
  "frame shell base geometry must be unit edge; scale applied when border visible"
);
assert(/applyCubeFaceLayoutToRigs/.test(sceneSrc), "presentationScene must resize faces on frame finish");
assert(/buildCubeFaceLayouts/.test(sceneSrc), "presentationScene must build layouts from cubeSequence");

assert(
  /0:\s*new THREE\.Euler\(0,\s*-Math\.PI\s*\/\s*2,\s*0\)/.test(seqSrc),
  "face 0 rotation must be -PI/2 (fanMotion reference)"
);
assert(
  /0:\s*new THREE\.Euler\(0,\s*-Math\.PI\s*\/\s*2,\s*0\)/.test(fanRef),
  "fanMotion reference face 0 is -PI/2"
);

assert(
  /WEDDING_FAN_PROFILE:\s*FanTimelineProfile\s*=\s*"wedding_default"/.test(weddingSrc),
  "wedding-simple must use wedding_default fan profile (fanMotion.js parity)"
);
assert(
  /resolveFanPhase\([^)]*fanSpeed/.test(weddingSrc),
  "wedding-simple resolveFanPhase must pass fanSpeed"
);

console.log("verify-cube-face-layout: OK");
