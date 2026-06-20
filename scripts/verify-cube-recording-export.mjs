#!/usr/bin/env node
/**
 * Smoke: MP4 export waits for stabilization before MediaRecorder.start.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const exportSrc = readFileSync(
  join(root, "apps/web/src/features/cube/cubeExportCapture.ts"),
  "utf8"
);
const cubeViewSrc = readFileSync(
  join(root, "apps/web/src/features/cube/CubeView.tsx"),
  "utf8"
);
const weddingSrc = readFileSync(
  join(root, "apps/web/src/features/wedding-simple/WeddingSimpleDashboard.tsx"),
  "utf8"
);

assert(/prepareCubeRecordingExport/.test(exportSrc), "prepareCubeRecordingExport must exist");
assert(/resolveRecordDurationMs/.test(exportSrc), "resolveRecordDurationMs must exist");
assert(/resolveExportRecordingElapsed/.test(exportSrc), "export timeline helper must exist");

assert(/prepareCubeRecordingExport/.test(cubeViewSrc), "CubeView must use prepareCubeRecordingExport");
assert(
  /recordingRef\.current = true[\s\S]*recorder\.start/.test(cubeViewSrc),
  "CubeView must start recorder after recordingRef flip"
);
assert(/resolveExportMotionElapsedMs/.test(cubeViewSrc), "CubeView must use fixed-frame export clock");
assert(/exportFrameIndexRef/.test(cubeViewSrc), "CubeView must advance export on frame index");

assert(/prepareCubeRecordingExport/.test(weddingSrc), "wedding-simple must use prepareCubeRecordingExport");
assert(/resolveExportMotionElapsedMs/.test(weddingSrc), "wedding-simple must use fixed-frame export clock");
assert(
  !/waitForRendererFrames\(3\)/.test(weddingSrc),
  "wedding-simple must not use 3-frame warmup only"
);
assert(/getContext\(\)\.finish/.test(weddingSrc), "wedding-simple must flush GPU during recording");

const sceneSrc = readFileSync(
  join(root, "apps/web/src/features/cube/presentationScene.ts"),
  "utf8"
);
assert(/setRecordingExportMode/.test(sceneSrc), "presentation scene must lock textures during export");
assert(/recordingExportMode/.test(sceneSrc), "carousel must skip during export");

const fanExportSrc = readFileSync(
  join(root, "apps/web/src/features/cube/fanExportRotation.ts"),
  "utf8"
);
assert(/exportTransitTumbleIntensity/.test(fanExportSrc), "export tumble + settle helper required");
assert(/isFanMotionExportRecording/.test(fanExportSrc), "export recording motion flag required");

console.log("verify-cube-recording-export: OK");
