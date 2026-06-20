#!/usr/bin/env npx tsx
/**
 * KPI verification for media presentation guide: presets, overlap hints, UI wiring.
 *
 * KPI-MEDIA-001  Preset catalog meets minimum count
 * KPI-MEDIA-002  Restraint preset (photo_focus) busy score <= max
 * KPI-MEDIA-003  Busy combo emits backdrop+synthetic warn hint
 * KPI-MEDIA-004  Ambient video preset keeps face theme blurred (not synthetic)
 * KPI-MEDIA-005  UI components wired in MediaSection / VoluMax header
 * KPI-MEDIA-006  Wedding dashboard uses combo presets + VoluMaxStatusHeader
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  MEDIA_COMBO_PRESETS,
  KPI_MEDIA_BUSY_WARN_THRESHOLD,
  KPI_MEDIA_BUSY_MAX_RESTRAINT_PRESET,
  KPI_MEDIA_PRESET_COUNT_MIN,
  computeMediaBusyScore,
  computeMediaOverlapHints,
  findMediaComboPreset,
  applyPresetToPresentationState,
} from "@mbox/shared";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

const results: { id: string; pass: boolean; detail: string }[] = [];

function kpi(id: string, pass: boolean, detail: string) {
  results.push({ id, pass, detail });
  if (!pass) console.error(`FAIL ${id}: ${detail}`);
}

// KPI-MEDIA-001
kpi(
  "KPI-MEDIA-001",
  MEDIA_COMBO_PRESETS.length >= KPI_MEDIA_PRESET_COUNT_MIN,
  `presets=${MEDIA_COMBO_PRESETS.length} min=${KPI_MEDIA_PRESET_COUNT_MIN}`
);

// KPI-MEDIA-002
const photoFocus = findMediaComboPreset("photo_focus");
const restraintScore = photoFocus
  ? computeMediaBusyScore(
      applyPresetToPresentationState(
        {
          viewportBackdropPath: null,
          backgroundPlateTheme: "original",
          particleTheme: "none",
          bgmEnabled: true,
          bgmTrackId: "piano_slideshow",
        },
        photoFocus.patch
      )
    )
  : 99;
kpi(
  "KPI-MEDIA-002",
  photoFocus !== undefined && restraintScore <= KPI_MEDIA_BUSY_MAX_RESTRAINT_PRESET,
  `photo_focus busy=${restraintScore} max=${KPI_MEDIA_BUSY_MAX_RESTRAINT_PRESET}`
);

// KPI-MEDIA-003
const busyState = {
  viewportBackdropPath: "배경동영상/rose.mp4",
  backgroundPlateTheme: "romantic_garden" as const,
  particleTheme: "confetti",
  bgmEnabled: true,
  bgmTrackId: "piano_slideshow",
};
const busyScore = computeMediaBusyScore(busyState);
const busyHints = computeMediaOverlapHints(busyState);
kpi(
  "KPI-MEDIA-003",
  busyScore >= KPI_MEDIA_BUSY_WARN_THRESHOLD &&
    busyHints.some((h) => h.id === "backdrop-plus-synthetic-theme" || h.id === "busy-score-high"),
  `busy=${busyScore} hints=${busyHints.map((h) => h.id).join(",")}`
);

// KPI-MEDIA-004
const ambient = findMediaComboPreset("ambient_video");
kpi(
  "KPI-MEDIA-004",
  ambient?.patch.backgroundPlateTheme === "original_blurred" &&
    ambient.patch.particleTheme === "none" &&
    ambient.patch.viewportBackdropPath === undefined,
  `ambient face=${ambient?.patch.backgroundPlateTheme} particle=${ambient?.patch.particleTheme}`
);

// KPI-MEDIA-005 static UI wiring
const mediaSection = read("apps/web/src/features/cube/media/MediaSection.tsx");
const voluMaxHeader = read("apps/web/src/features/cube/media/VoluMaxStatusHeader.tsx");
kpi(
  "KPI-MEDIA-005",
  mediaSection.includes("MediaComboPresets") &&
    mediaSection.includes("MediaOverlapHint") &&
    voluMaxHeader.includes('data-testid="volumax-status-header"'),
  "MediaSection + VoluMaxStatusHeader present"
);

const cubePanel = read("apps/web/src/features/cube/CubeFocusPanel.tsx");
kpi(
  "KPI-MEDIA-005b",
  cubePanel.includes("VoluMaxStatusHeader") && cubePanel.includes("onApplyComboPreset"),
  "CubeFocusPanel wired"
);

// KPI-MEDIA-006 wedding
const wedding = read("apps/web/src/features/wedding-simple/WeddingSimpleDashboard.tsx");
kpi(
  "KPI-MEDIA-006",
  wedding.includes("onApplyComboPreset") &&
    wedding.includes("VoluMaxStatusHeader") &&
    wedding.includes("activeComboPresetId"),
  "WeddingSimpleDashboard wired"
);

// KPI-MEDIA-007 unique preset ids
const ids = MEDIA_COMBO_PRESETS.map((p) => p.id);
kpi("KPI-MEDIA-007", new Set(ids).size === ids.length, `unique ids=${ids.length}`);

// KPI-MEDIA-008 restrained default hint
const defaultHints = computeMediaOverlapHints({
  viewportBackdropPath: null,
  backgroundPlateTheme: "original",
  particleTheme: "none",
  bgmEnabled: false,
  bgmTrackId: "none",
});
kpi(
  "KPI-MEDIA-008",
  defaultHints.some((h) => h.id === "restrained-default"),
  `default hints=${defaultHints.map((h) => h.id).join(",")}`
);

const failed = results.filter((r) => !r.pass);
console.log("\n--- Media Presentation KPI ---");
for (const row of results) {
  console.log(`${row.pass ? "PASS" : "FAIL"} ${row.id}: ${row.detail}`);
}
console.log(`\n${results.length - failed.length}/${results.length} KPI checks passed`);

if (failed.length > 0) {
  process.exit(1);
}
console.log("verify-media-presentation-kpi: PASS");
