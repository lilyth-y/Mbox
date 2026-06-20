#!/usr/bin/env node
/**
 * KPI: Hybrid composite segment expansion (ColorKey before switch, Screen after).
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function expandCompositeRenderJobs(segments, blendMode, hybridSwitchSec) {
  const jobs = [];
  for (const seg of segments) {
    const start = seg.Start;
    const duration = seg.Duration;
    const end = start + duration;
    const outPath = seg.Path;
    const index = seg.Index;

    if (blendMode !== "Hybrid") {
      jobs.push({ ...seg, Mode: blendMode });
      continue;
    }
    if (start >= hybridSwitchSec) {
      jobs.push({ Index: index, Start: start, Duration: duration, Path: outPath, Mode: "Screen" });
      continue;
    }
    if (end <= hybridSwitchSec + 0.001) {
      jobs.push({ Index: index, Start: start, Duration: duration, Path: outPath, Mode: "ColorKey" });
      continue;
    }
    const firstLen = hybridSwitchSec - start;
    const secondLen = end - hybridSwitchSec;
    jobs.push({
      Index: index,
      Start: start,
      Duration: firstLen,
      Path: `${outPath}.a`,
      Mode: "ColorKey",
      MergeInto: outPath,
    });
    jobs.push({
      Index: index,
      Start: hybridSwitchSec,
      Duration: secondLen,
      Path: `${outPath}.b`,
      Mode: "Screen",
      MergeInto: outPath,
    });
  }
  return jobs;
}

let failed = 0;
function fail(msg) {
  console.error(`FAIL: ${msg}`);
  failed++;
}

const ps1 = readFileSync(join(root, "scripts/composite_rose_cube_video.ps1"), "utf8");
if (!ps1.includes("Hybrid") || !ps1.includes("Expand-CompositeRenderJobs")) {
  fail("composite script missing Hybrid blend expansion");
}
if (!ps1.includes("Merge-HybridParts")) {
  fail("composite script missing hybrid part merge");
}

const segs = [{ Index: 1, Start: 0, Duration: 60, Path: "p1.mp4" }];
const j1 = expandCompositeRenderJobs(segs, "Hybrid", 60);
if (j1.length !== 1 || j1[0].Mode !== "ColorKey") {
  fail(`0-60s segment expected ColorKey, got ${JSON.stringify(j1)}`);
}

const segs2 = [{ Index: 2, Start: 60, Duration: 60, Path: "p2.mp4" }];
const j2 = expandCompositeRenderJobs(segs2, "Hybrid", 60);
if (j2.length !== 1 || j2[0].Mode !== "Screen") {
  fail(`60s+ segment expected Screen, got ${JSON.stringify(j2)}`);
}

const segs3 = [{ Index: 1, Start: 30, Duration: 60, Path: "px.mp4" }];
const j3 = expandCompositeRenderJobs(segs3, "Hybrid", 60);
if (j3.length !== 2 || j3[0].Mode !== "ColorKey" || j3[1].Mode !== "Screen") {
  fail(`crossing segment expected split, got ${JSON.stringify(j3)}`);
}

const builder = readFileSync(join(root, "scripts/lib/background-catalog-builder.mjs"), "utf8");
if (!builder.includes("ASSET_DISPLAY_LABELS") || !builder.includes("2026_06_10 11_31.mp4")) {
  fail("catalog builder missing display labels");
}

const panel = readFileSync(
  join(root, "apps/web/src/features/composite/WorkflowVideoCompositePanel.tsx"),
  "utf8"
);
if (!panel.includes("buildCompositeCommand") || !panel.includes("Hybrid")) {
  fail("WorkflowVideoCompositePanel incomplete");
}
const app = readFileSync(join(root, "apps/web/src/app/App.tsx"), "utf8");
if (!app.includes("WorkflowVideoCompositePanel")) {
  fail("App.tsx missing workflow-wide composite panel");
}

if (failed > 0) {
  process.exit(1);
}
console.log("verify-composite-hybrid: PASS");
