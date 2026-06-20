#!/usr/bin/env node
/**
 * Tier 1: synthetic FQI calibration (no browser).
 *   npx tsx scripts/verify-cube-frame-aesthetic.mjs
 */
import {
  DEFAULT_FRAME_AESTHETIC_THRESHOLDS,
  listFramePresetIds,
  measureFrameAesthetic,
  passesFrameAestheticGate,
  synthesizeBrokenFrameBuffer,
  synthesizeReferenceFrameBuffer,
} from "@mbox/shared";

const REFERENCE_FQI_MIN = 0.75;
const BROKEN_FQI_MAX = 0.55;

let failed = 0;

console.log("[tier1] synthetic reference buffers");
for (const presetId of listFramePresetIds()) {
  const buffer = synthesizeReferenceFrameBuffer(presetId, 512);
  const sample = measureFrameAesthetic(buffer, presetId);
  const gate = passesFrameAestheticGate(sample, DEFAULT_FRAME_AESTHETIC_THRESHOLDS);
  const ok = sample.fqi >= REFERENCE_FQI_MIN && gate.pass;
  console.log(
    `  ${presetId}: FQI=${sample.fqi.toFixed(3)} gate=${gate.pass ? "PASS" : "FAIL"}`
  );
  if (!ok) {
    failed += 1;
    console.error(`    reasons: ${gate.reasons.join("; ") || `FQI < ${REFERENCE_FQI_MIN}`}`);
  }
}

console.log("[tier1] broken counterexample (flat matte)");
const broken = measureFrameAesthetic(synthesizeBrokenFrameBuffer(512), "rose_gold");
const brokenOk = broken.fqi <= BROKEN_FQI_MAX;
console.log(`  flat buffer FQI=${broken.fqi.toFixed(3)} (expect <= ${BROKEN_FQI_MAX})`);
if (!brokenOk) {
  failed += 1;
}

console.log("[tier1] discriminative margin");
const roseRef = measureFrameAesthetic(synthesizeReferenceFrameBuffer("rose_gold"), "rose_gold");
const margin = roseRef.fqi - broken.fqi;
if (margin < 0.25) {
  failed += 1;
  console.error(`  margin ${margin.toFixed(3)} < 0.25 — metrics may not separate good vs bad`);
} else {
  console.log(`  margin=${margin.toFixed(3)} OK`);
}

if (failed > 0) {
  console.error(`verify-cube-frame-aesthetic: FAIL (${failed} checks)`);
  process.exit(1);
}

console.log("verify-cube-frame-aesthetic: OK");
