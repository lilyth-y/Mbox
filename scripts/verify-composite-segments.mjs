#!/usr/bin/env node
/** KPI E1: segment duration sum vs source foreground duration. */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ffprobeDuration } from "./measure-composite-kpi.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = process.argv[2] ?? join(root, "experiments/outputs/composite_rose_cube_focus_manifest.json");
const TOLERANCE_SEC = 0.15;

function main() {
  if (!existsSync(manifestPath)) {
    console.error("Manifest not found:", manifestPath);
    process.exit(1);
  }
  let raw = readFileSync(manifestPath, "utf8");
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
  const manifest = JSON.parse(raw);
  const sourceDur = ffprobeDuration(manifest.foreground);
  let sumManifest = 0;
  let sumProbe = 0;
  const parts = [];

  for (const seg of manifest.segments) {
    const probed = ffprobeDuration(seg.file);
    sumManifest += seg.durationSec;
    sumProbe += probed ?? 0;
    parts.push({ index: seg.index, manifestSec: seg.durationSec, probedSec: probed, file: seg.file });
  }

  const gapManifest = Math.abs(sumManifest - sourceDur);
  const gapProbe = Math.abs(sumProbe - sourceDur);
  const pass = gapProbe <= TOLERANCE_SEC;

  const result = {
    kpi: "segment_duration_sum",
    target: `<= ${TOLERANCE_SEC}s gap vs foreground`,
    theoreticalBest: "0s gap",
    sourceDurationSec: sourceDur,
    sumManifestSec: sumManifest,
    sumProbedSec: sumProbe,
    gapManifestSec: gapManifest,
    gapProbeSec: gapProbe,
    measured: gapProbe,
    result: pass ? "PASS" : "FAIL",
    parts,
  };
  console.log(JSON.stringify(result, null, 2));
  process.exit(pass ? 0 : 1);
}

main();
