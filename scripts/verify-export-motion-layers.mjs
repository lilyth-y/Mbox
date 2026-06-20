#!/usr/bin/env node
/**
 * Documents MP4 export motion layers — which stack in preview vs export capture.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const fanExport = readFileSync(
  join(root, "apps/web/src/features/cube/fanExportRotation.ts"),
  "utf8"
);
const fanPhases = readFileSync(
  join(root, "apps/web/src/features/cube/fanPhases.ts"),
  "utf8"
);
const fanTimeline = readFileSync(
  join(root, "apps/web/src/features/cube/cubeFanTimeline.ts"),
  "utf8"
);
const cubeView = readFileSync(
  join(root, "apps/web/src/features/cube/CubeView.tsx"),
  "utf8"
);
const wedding = readFileSync(
  join(root, "apps/web/src/features/wedding-simple/WeddingSimpleDashboard.tsx"),
  "utf8"
);
const motionApply = readFileSync(
  join(root, "apps/web/src/features/cube/cubeFocusMotionApply.ts"),
  "utf8"
);

// Export-only path
assert(/exportTransitTumbleIntensity/.test(fanExport), "export tumble helper");
assert(/isFanMotionExportRecording/.test(fanPhases), "fan phases read export flag");
assert(/faceRotation\.clone\(\)/.test(fanPhases), "showcase face lock");

// Suppressed during export (overlap fixes)
assert(/!exportRecording &&/.test(fanTimeline), "phase seam crossfade skipped on export");
assert(/getScaleGatedRevsWithinStep/.test(fanPhases), "scale-gated timeline yaw in fan phases");
assert(/rotationMotionGate/.test(fanExport), "export tumble gated by peak scale");
assert(/!options\.recording/.test(motionApply), "angular inertia off when recording");
assert(/!isExportCapture[\s\S]*updateRotationParallax/.test(cubeView), "rotation parallax off during export");
assert(/!isExportCapture[\s\S]*updateRotationParallax/.test(wedding), "wedding: rotation parallax off");
assert(/exportPipelineActiveRef/.test(cubeView), "prepare+record share export motion path");
assert(/exportPipelineActiveRef/.test(wedding), "wedding: pipeline export flag");

const layers = [
  { layer: "timeline_yaw_spin", preview: "scale-gated (peak hold only)", export: "scale-gated (peak hold only)" },
  { layer: "phase_seam_crossfade (680ms slerp)", preview: "on if zoom", export: "off" },
  { layer: "export_transit_tumble (pitch/roll)", preview: "off", export: "on" },
  { layer: "showcase_face_lock", preview: "approach-end yaw", export: "approach-end yaw (scale-gated)" },
  { layer: "angular_inertia spring", preview: "optional", export: "off" },
  { layer: "rotation_parallax_coupling", preview: "on", export: "off" },
  { layer: "preview_heartbeat_scale", preview: "optional", export: "off" },
  { layer: "cubeShowcaseZoom dolly", preview: "optional", export: "scale path kept" },
  { layer: "fixed_30fps_motion_clock", preview: "wall clock", export: "frame index" },
];

console.log("verify-export-motion-layers: OK\n");
console.log("Layer stack (preview vs MP4 export):\n");
for (const row of layers) {
  console.log(`  ${row.layer}`);
  console.log(`    preview: ${row.preview}`);
  console.log(`    export:  ${row.export}\n`);
}
