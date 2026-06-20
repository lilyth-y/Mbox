/**
 * Fan motion consolidation KPI — duplicate helpers + composer coverage.
 *   npx tsx scripts/audit-fan-motion-duplicates.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cube = join(root, "apps/web/src/features/cube");

const HELPER_SYMBOLS = [
  { label: "fanSpeedMul", pattern: /export function fanSpeedMul\b/g },
  { label: "fanSmootherstep", pattern: /export function fanSmootherstep\b/g },
  { label: "fanSmootherstep01", pattern: /export function fanSmootherstep01\b/g },
  { label: "getStepPhaseBoundaryMs", pattern: /export function getStepPhaseBoundaryMs\b/g },
  { label: "applyTimelineYawAfterShowcase", pattern: /export function applyTimelineYawAfterShowcase\b/g },
  { label: "applyTimelineYaw", pattern: /export function applyTimelineYaw\b/g },
  { label: "getGatedRevsWithinStep", pattern: /export function getGatedRevsWithinStep\b/g },
  { label: "applyAxisTumble", pattern: /export function applyAxisTumble\b/g },
  { label: "resolveExportHandoffTumbleIntensity", pattern: /export function resolveExportHandoffTumbleIntensity\b/g },
  { label: "handoffGapSubProgress", pattern: /export function handoffGapSubProgress\b/g },
];

const HELPER_FILES = [
  "fanEase.ts",
  "fanMotionCommon.ts",
  "fanPhases.ts",
  "fanRotationComposer.ts",
  "fanTransform.ts",
  "fanExportRotation.ts",
  "cubeTransitionRotation.ts",
];

const COMPOSERS = [
  "composeInPlaceApproachRotation",
  "composeInPlaceRetreatRotation",
  "composeInPlaceHandoffRotation",
  "composeZoomApproachRotation",
  "composeZoomRetreatRotation",
  "composeZoomHandoffRotation",
];

const INLINE_PATTERNS = [
  { label: "inline applyTimelineYawAfterShowcase block", file: "fanPhases.ts", pattern: /applyTimelineYawAfterShowcase\(/g },
  { label: "inline blendRotationTowardFaceAtPeak", file: "fanPhases.ts", pattern: /blendRotationTowardFaceAtPeak\(/g },
  { label: "local smootherstep01", file: "fanTransform.ts", pattern: /function smootherstep01\b/g },
  { label: "local smootherstep01", file: "cubeTransitionRotation.ts", pattern: /function smootherstep01\b/g },
];

let duplicateDefs = 0;
console.log("Helper ownership (export function):\n");
for (const sym of HELPER_SYMBOLS) {
  const owners = [];
  for (const file of HELPER_FILES) {
    const text = readFileSync(join(cube, file), "utf8");
    const count = (text.match(sym.pattern) ?? []).length;
    if (count > 0) owners.push({ file, count });
  }
  const total = owners.reduce((a, o) => a + o.count, 0);
  if (total > 1) duplicateDefs += total - 1;
  const status = total > 1 ? "DUPLICATE" : total === 1 ? "ok" : total === 0 ? "n/a" : "missing";
  console.log(
    `  ${sym.label.padEnd(36)} total=${total}  ${status}  ${owners.map((o) => `${o.file}:${o.count}`).join(", ") || "—"}`
  );
}

const phases = readFileSync(join(cube, "fanPhases.ts"), "utf8");
const composer = readFileSync(join(cube, "fanRotationComposer.ts"), "utf8");

console.log("\nRotation composer coverage:");
for (const name of COMPOSERS) {
  const defined = composer.includes(`export function ${name}`);
  const used = phases.includes(name);
  console.log(`  ${name}: defined=${defined} usedInPhases=${used}`);
}

let inlineHits = 0;
console.log("\nInline rotation logic in fanPhases (should be 0):");
for (const row of INLINE_PATTERNS) {
  const text = readFileSync(join(cube, row.file), "utf8");
  const count = (text.match(row.pattern) ?? []).length;
  if (count > 0) inlineHits += count;
  console.log(`  ${row.label} (${row.file}): ${count}`);
}

const allComposersUsed = COMPOSERS.every((c) => phases.includes(c));
const kpiPass = duplicateDefs === 0 && inlineHits === 0 && allComposersUsed;

console.log(`\nKPI duplicate helper excess: ${duplicateDefs} (target 0)`);
console.log(`KPI inline rotation in fanPhases: ${inlineHits} (target 0)`);
console.log(`KPI all composers wired: ${allComposersUsed ? "yes" : "no"}`);
console.log(`\nOverall: ${kpiPass ? "PASS" : "FAIL"}`);
