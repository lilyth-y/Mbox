#!/usr/bin/env node
/**
 * Static audit: jewel mesh scale must not change during pipeline ticks.
 *
 *   node scripts/verify-showcase-scale-invariance.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const showcaseRoot = join(root, "apps/web/src/features/showcase");

function read(relPath) {
  return readFileSync(join(showcaseRoot, relPath), "utf8");
}

function rg(pattern, searchPath) {
  const result = spawnSync("rg", ["-n", pattern, searchPath], {
    encoding: "utf8",
    cwd: root,
  });
  if (result.status !== 0 && !result.stdout?.trim()) {
    return [];
  }
  return result.stdout.trim().split("\n").filter(Boolean);
}

const jewelScale = read("babylon/showcaseJewelScale.ts");
const callSites = rg("applyJewelCrystalScale\\(", showcaseRoot);

function normalizePath(line) {
  return line.replace(/\\/g, "/");
}

function isAllowedApplySite(site) {
  const p = normalizePath(site);
  if (p.includes("babylon/showcaseJewelScale.ts")) {
    return true;
  }
  if (p.includes("pipeline/stages/revealStage.ts") && p.includes("applyJewelCrystalScale")) {
    return true;
  }
  if (
    p.includes("babylon/createShowcasePhysicsScene.ts") &&
    p.includes("applyJewelCrystalScale")
  ) {
    return true;
  }
  return false;
}

const unexpectedCalls = callSites.filter((site) => !isAllowedApplySite(site));

const scalingWriteSites = rg("collider\\.scaling\\.set", showcaseRoot);
const scalingOutsideJewelScale = scalingWriteSites.filter(
  (line) => !normalizePath(line).includes("babylon/showcaseJewelScale.ts")
);

const stageScaleTouches = rg(
  "applyJewelCrystalScale|collider\\.scaling",
  join(showcaseRoot, "pipeline/stages")
);

const badStageTouches = stageScaleTouches.filter((line) => {
  const p = normalizePath(line);
  if (p.includes("collider.scaling")) {
    return true;
  }
  if (p.includes("applyJewelCrystalScale")) {
    return !p.includes("pipeline/stages/revealStage.ts");
  }
  return false;
});

const errors = [];

if (!jewelScale.includes("Only call on reveal spawn or catalog size slider")) {
  errors.push("showcaseJewelScale.ts missing scale mutation guard comment");
}

if (unexpectedCalls.length > 0) {
  errors.push(
    `applyJewelCrystalScale called outside spawn/catalog: ${unexpectedCalls.join(", ")}`
  );
}

if (scalingOutsideJewelScale.length > 0) {
  errors.push(
    `collider.scaling.set outside showcaseJewelScale.ts: ${scalingOutsideJewelScale.join(", ")}`
  );
}

if (badStageTouches.length > 0) {
  errors.push(`pipeline/stages mutate scale: ${badStageTouches.join("; ")}`);
}

const tsx = spawnSync(
  process.execPath,
  [
    "--import",
    "tsx",
    "-e",
    `
import {
  clampJewelCrystalSizeScale,
  getJewelCrystalFramingExtent,
} from "./apps/web/src/features/showcase/babylon/showcaseJewelScale.ts";

const s115 = clampJewelCrystalSizeScale(1.15);
const s040 = clampJewelCrystalSizeScale(0.4);
const e = getJewelCrystalFramingExtent("cube", s115);
if (Math.abs(s115 - 1.15) > 1e-9) throw new Error("clamp high");
if (Math.abs(s040 - 0.55) > 1e-9) throw new Error("clamp low");
if (!(e > 0)) throw new Error("framing extent");
console.log("jewel scale helpers ok");
`,
  ],
  { cwd: root, encoding: "utf8", timeout: 60_000 }
);

if (tsx.status !== 0) {
  errors.push(tsx.stderr?.trim() || "tsx scale helper check failed");
}

if (errors.length > 0) {
  console.error("verify-showcase-scale-invariance FAILED");
  for (const err of errors) {
    console.error(" -", err);
  }
  process.exit(1);
}

console.log("verify-showcase-scale-invariance OK");
console.log(`  applyJewelCrystalScale callsites: ${callSites.length} (spawn + catalog only)`);
console.log("  pipeline stages: no mesh scale mutations");
console.log("  camera zoom (pull/ascend/breathe) is intentional — not mesh scale");
