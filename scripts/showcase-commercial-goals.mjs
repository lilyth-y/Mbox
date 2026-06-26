#!/usr/bin/env node
/**
 * Commercial launch goal program — measure all gates (/goal skill).
 *
 *   npm run verify:showcase-commercial
 *   npm run verify:showcase-commercial -- --run-e2e
 *   npm run verify:showcase-commercial -- --json
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  evaluateShowcaseCommercialGoals,
  formatShowcaseCommercialGoalReport,
} from "@mbox/shared";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const runE2e = process.argv.includes("--run-e2e");
const jsonOut = process.argv.includes("--json");

const NO_FALL_ORDER = ["reveal", "rotate", "pull", "ascend"];

const versionsPath = join(
  root,
  "apps/web/src/features/showcase/pipeline/showcaseStageVersions.ts"
);
const presetsPath = join(root, "packages/shared/src/showcaseCommercialPresets.ts");
const shapesPath = join(
  root,
  "apps/web/src/features/showcase/babylon/photoCrystalShapeCatalog.ts"
);
const corpusDir = join(root, "data/showcase-qa-corpus");
const reportDir = join(root, "experiments/showcase-commercial-goals");

function parseStages() {
  const src = readFileSync(versionsPath, "utf8");
  const byId = new Map();
  for (const id of NO_FALL_ORDER) {
    const blockRe = new RegExp(`${id}:\\s*\\{([\\s\\S]*?)\\n  \\},`, "m");
    const block = src.match(blockRe)?.[1];
    if (!block) continue;
    const maturity = block.match(/maturity:\s*"(\w+)"/)?.[1] ?? "alpha";
    const issuesBlock = block.match(/knownIssuesKo:\s*\[([\s\S]*?)\]/)?.[1] ?? "";
    const knownIssuesKo = [...issuesBlock.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    byId.set(id, { id, maturity, knownIssuesKo });
  }
  return byId;
}

function parsePresetCount() {
  const src = readFileSync(presetsPath, "utf8");
  return [
    ...src.matchAll(/id:\s*"(rose_gold_premium|classic|modern_black)"/g),
  ].length;
}

function parseShapeCount() {
  const src = readFileSync(shapesPath, "utf8");
  return (
    src.match(
      /id: "(cube|tall_rect|hex_prism|heart|sphere|gem_prism)"/g
    )?.length ?? 0
  );
}

function countCorpusImages() {
  if (!existsSync(corpusDir)) {
    return 0;
  }
  return readdirSync(corpusDir).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).length;
}

function loadPhotoBatchResult() {
  const batchPath = join(reportDir, "photo-batch-latest.json");
  if (!existsSync(batchPath)) {
    return undefined;
  }
  try {
    const data = JSON.parse(readFileSync(batchPath, "utf8"));
    return typeof data.passRate === "number" ? data.passRate : undefined;
  } catch {
    return undefined;
  }
}

function loadShapesValidationResult() {
  const shapesPath = join(reportDir, "shapes-latest.json");
  if (!existsSync(shapesPath)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(shapesPath, "utf8"));
  } catch {
    return null;
  }
}

function ensureShapesReport({ runLive = false } = {}) {
  const existing = loadShapesValidationResult();
  if (existing && !runLive && existing.mode === "static+live") {
    return existing;
  }
  const args = ["scripts/verify-showcase-shapes.mjs"];
  if (runLive) {
    args.push("--live");
  }
  const child = spawnSync(process.execPath, args, {
    cwd: root,
    encoding: "utf8",
    timeout: Number(process.env.MBOX_SHAPE_SUITE_TIMEOUT_MS ?? 600_000),
    env: {
      ...process.env,
      MBOX_SHOWCASE_URL:
        process.env.MBOX_SHOWCASE_URL ??
        "http://localhost:5173/showcase.html",
    },
  });
  if (child.stdout) {
    console.log(child.stdout.trimEnd());
  }
  if (child.status !== 0 && child.stderr) {
    console.error(child.stderr.trimEnd());
  }
  return loadShapesValidationResult();
}

function runWysiwygE2e() {
  const url =
    process.env.MBOX_SHOWCASE_URL ??
    "http://127.0.0.1:4174/showcase.html?look=modern_black&backdrop=";
  const child = spawnSync(process.execPath, ["scripts/e2e-showcase-export.mjs"], {
    cwd: root,
    encoding: "utf8",
    timeout: Number(process.env.MBOX_RECORD_TIMEOUT_MS ?? 200_000),
    env: {
      ...process.env,
      MBOX_SHOWCASE_URL: url,
      MBOX_RECORD_TIMEOUT_MS: process.env.MBOX_RECORD_TIMEOUT_MS ?? "200000",
    },
  });
  if (child.status !== 0) {
    console.error(child.stderr || child.stdout);
    return false;
  }
  return true;
}

const stageMap = parseStages();
const activeStages = NO_FALL_ORDER.map((id) => stageMap.get(id)).filter(Boolean);
const maturities = activeStages.map((s) => s.maturity);
const motionIssues = activeStages.flatMap((s) => s.knownIssuesKo ?? []);

let wysiwygPassed;
if (runE2e) {
  console.log("Running WYSIWYG export e2e…");
  wysiwygPassed = runWysiwygE2e();
} else {
  const lastReport = join(reportDir, "e2e-latest.json");
  if (existsSync(lastReport)) {
    try {
      wysiwygPassed = JSON.parse(readFileSync(lastReport, "utf8")).wysiwygPassed;
    } catch {
      wysiwygPassed = undefined;
    }
  }
}

const shapesTotal = parseShapeCount();
const shapesReport = ensureShapesReport({ runLive: runE2e });
const shapesValidated =
  shapesReport?.mode === "static+live"
    ? (shapesReport.gateValidatedCount ?? shapesReport.validatedCount ?? 0)
    : 0;

const result = evaluateShowcaseCommercialGoals({
  activeStageMaturities: maturities,
  commercialPresetCount: parsePresetCount(),
  wysiwygPassed,
  photoCorpusSize: countCorpusImages(),
  measuredPhotoPassRate: loadPhotoBatchResult(),
  photoBatchWaived: process.env.SHOWCASE_PHOTO_BATCH_REQUIRED !== "1",
  motionKnownIssues: motionIssues,
  shapesValidated,
  shapesTotal,
  // 1:1 export — validated via WYSIWYG e2e (1080²); 9:16·16:9 out of scope.
  boothAspectsValidated: wysiwygPassed === true ? 1 : wysiwygPassed === false ? 0 : undefined,
});

mkdirSync(reportDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const reportPath = join(reportDir, `run-${stamp}.json`);
const latestPath = join(reportDir, "latest.json");
writeFileSync(reportPath, JSON.stringify(result, null, 2));
writeFileSync(latestPath, JSON.stringify(result, null, 2));

if (runE2e) {
  writeFileSync(
    join(reportDir, "e2e-latest.json"),
    JSON.stringify({ wysiwygPassed, at: new Date().toISOString() }, null, 2)
  );
}

const text = formatShowcaseCommercialGoalReport(result);
if (jsonOut) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(text);
  console.log(`\nReport: ${reportPath}`);
}

process.exit(result.masterResult === "PASS" ? 0 : 1);
