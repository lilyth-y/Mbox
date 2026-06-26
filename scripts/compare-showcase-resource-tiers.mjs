#!/usr/bin/env node
/**
 * A/B profile: default vs noPhysics vs safe (Windows simplified tiers).
 * Usage: node scripts/compare-showcase-resource-tiers.mjs [baseUrl]
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const base = process.argv[2] ?? "http://127.0.0.1:4176/showcase.html";
const testImage = join(root, "data/showcase-qa-corpus/qa_005_portrait.jpg");
const outPath = join(root, "experiments", "showcase-resource-tiers.json");

const SCENARIOS = [
  { id: "default", query: "" },
  { id: "no_physics", query: "noPhysics=1" },
  { id: "safe", query: "safe=1" },
];

const useSwiftShader =
  process.env.MBOX_USE_SWIFTSHADER !== "0" && process.env.MBOX_USE_SWIFTSHADER !== "false";

async function runScenario(browser, scenario) {
  const url = new URL(base);
  url.searchParams.set("localOnly", "1");
  if (scenario.query) {
    for (const part of scenario.query.split("&")) {
      const [k, v] = part.split("=");
      url.searchParams.set(k, v);
    }
  }
  url.searchParams.set("profile", "1");

  const context = await browser.newContext({ viewport: { width: 1080, height: 1080 } });
  await context.addInitScript(() => {
    window.__MBOX_SHOWCASE_E2E__ = true;
    window.__MBOX_SHOWCASE_AUTOMATION__ = true;
  });
  const page = await context.newPage();
  let contextLost = false;
  page.on("console", (msg) => {
    if (/context lost|CONTEXT_LOST/i.test(msg.text())) {
      contextLost = true;
    }
  });

  await page.goto(url.toString(), { waitUntil: "load", timeout: 120_000 });
  const uploadInput = page.locator('[data-testid="showcase-photo-upload"]');
  await uploadInput.waitFor({ state: "attached", timeout: 90_000 });
  await uploadInput.setInputFiles([testImage]);
  try {
    await page.waitForFunction(() => /\d+장 ·/.test(document.body.innerText), { timeout: 60_000 });
  } catch {
    /* partial */
  }

  const deadline = Date.now() + 45_000;
  let report = null;
  while (Date.now() < deadline) {
    report = await page.evaluate(() => window.__MBOX_SHOWCASE_RESOURCE_REPORT__ ?? null);
    if (report?.phases?.some((p) => p.phase === "jewel_spawn")) {
      break;
    }
    await page.waitForTimeout(500);
  }

  const ui = await page.evaluate(() => ({
    error: document.body.innerText.includes("WebGL은 시작됐지만"),
    status: document.body.innerText.match(/\d+장 · [^\n]+/)?.[0] ?? null,
  }));

  await context.close();
  return { id: scenario.id, url: url.toString(), contextLost, ui, report };
}

mkdirSync(join(root, "experiments"), { recursive: true });

const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: useSwiftShader
    ? ["--use-gl=swiftshader", "--enable-webgl"]
    : ["--use-gl=angle", "--ignore-gpu-blocklist", "--enable-webgl"],
});

const results = [];
for (const scenario of SCENARIOS) {
  results.push(await runScenario(browser, scenario));
}
await browser.close();

writeFileSync(outPath, `${JSON.stringify({ measuredAt: new Date().toISOString(), results }, null, 2)}\n`);
console.log(JSON.stringify(results, null, 2));
console.log(`\nWrote ${outPath}`);
