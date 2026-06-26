/**
 * Print showcase stage versions + commercial tier readiness (CI / local QA).
 * Usage: node scripts/showcase-content-manifest.mjs [--fall]
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

// Lightweight parse — avoid full TS build for manifest-only checks.
const versionsPath = join(
  root,
  "apps/web/src/features/showcase/pipeline/showcaseStageVersions.ts"
);
const specPath = join(root, "packages/shared/src/showcaseCommercialSpec.ts");
const presetsPath = join(root, "packages/shared/src/showcaseCommercialPresets.ts");

const fallPhysics = process.argv.includes("--fall");

const NO_FALL_ORDER = ["reveal", "rotate", "pull", "ascend"];
const FALL_ORDER = ["reveal", "fall", "bounce", "rotate", "pull", "ascend"];
const order = fallPhysics ? FALL_ORDER : NO_FALL_ORDER;

const versionsSrc = readFileSync(versionsPath, "utf8");
const specSrc = readFileSync(specPath, "utf8");
const presetsSrc = readFileSync(presetsPath, "utf8");

const targetMatch = specSrc.match(
  /SHOWCASE_CURRENT_CONTENT_TARGET[^=]*=\s*"([^"]+)"/
);
const targetTier = targetMatch?.[1] ?? "beta_sales";

const stageBlocks = [...versionsSrc.matchAll(/(\w+):\s*\{[\s\S]*?id:\s*"(\w+)"[\s\S]*?version:\s*"([^"]+)"[\s\S]*?maturity:\s*"(\w+)"/g)];

const byId = new Map();
for (const m of stageBlocks) {
  byId.set(m[2], { id: m[2], version: m[3], maturity: m[4] });
}

const maturityOrder = { alpha: 0, beta: 1, rc: 2, commercial: 3 };
const tierMin = targetTier === "commercial_launch" ? "commercial" : targetTier === "beta_sales" ? "beta" : "alpha";

console.log(`# Showcase content manifest`);
console.log(`target: ${targetTier}`);
console.log(`pipeline: ${order.join(" → ")}`);
console.log("");

let bottleneck = "commercial";
let blockers = [];

for (const id of order) {
  const rec = byId.get(id);
  if (!rec) {
    console.log(`- ${id}: MISSING`);
    blockers.push(`${id} not in registry`);
    continue;
  }
  const flags = [];
  if ((maturityOrder[rec.maturity] ?? 0) < (maturityOrder[tierMin] ?? 0)) {
    flags.push("BELOW_TIER");
    blockers.push(`${id} maturity ${rec.maturity} < ${tierMin}`);
  }
  if ((maturityOrder[rec.maturity] ?? 0) < (maturityOrder[bottleneck] ?? 3)) {
    bottleneck = rec.maturity;
  }
  console.log(
    `- ${id} v${rec.version} [${rec.maturity}]${flags.length ? " ⚠ " + flags.join(",") : ""}`
  );
}

console.log("");
console.log(`bottleneck: ${bottleneck}`);

const presetIds = [...presetsSrc.matchAll(/id:\s*"(rose_gold_premium|classic|modern_black)"/g)].map(
  (m) => m[1]
);
const presetOnly = /presetOnlyWorkflow:\s*true/.test(specSrc);
if (presetOnly && presetIds.length < 3) {
  blockers.push(`commercial presets ${presetIds.length}/3`);
}
console.log(`commercial looks: ${presetIds.join(", ") || "none"}`);

console.log(`ready for ${targetTier}: ${blockers.length === 0 ? "YES" : "NO"}`);
if (blockers.length) {
  for (const b of blockers) {
    console.log(`  blocker: ${b}`);
  }
  process.exitCode = 1;
}
