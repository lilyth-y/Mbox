#!/usr/bin/env node
/**
 * Measure crystal showcase load phases (page → upload → Havok → scene ready).
 * Usage: node scripts/measure-showcase-load.mjs [showcaseUrl]
 */
import { chromium } from "playwright";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const url =
  process.argv[2] ?? "http://localhost:5175/showcase.html?shape=cube&bg=booth";
const testImage = join(root, "data/showcase-qa-corpus/qa_005_portrait.jpg");

const browser = await chromium.launch({
  headless: true,
  args: [
    "--use-gl=angle",
    "--ignore-gpu-blocklist",
    "--enable-webgl",
    "--disable-background-timer-throttling",
  ],
});

async function runPass(label) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const t0 = Date.now();
  const marks = [];
  const mark = (name) => marks.push({ name, ms: Date.now() - t0 });

  mark("start");
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120_000 });
  mark("domcontentloaded");

  await page.waitForLoadState("load", { timeout: 60_000 }).catch(() => undefined);
  mark("load");

  const earlyPerf = await page.evaluate(() => {
    const resources = performance.getEntriesByType("resource");
    const wasm = resources.find((r) => r.name.includes("HavokPhysics.wasm"));
    return {
      wasmStarted: Boolean(wasm),
      wasmMs: wasm ? Math.round(wasm.duration) : null,
      wasmTransferKb: wasm?.transferSize ? Math.round(wasm.transferSize / 1024) : null,
      bodySnippet: document.body.innerText.match(/[^\n]{8,80}/)?.[0] ?? null,
    };
  });
  mark("early_perf");

  const fileInput = page.locator('label:has-text("사진 업로드") input[type="file"]');
  await fileInput.setInputFiles([testImage]);
  mark("image_selected");

  await page.waitForFunction(
    () => /\d+장 ·/.test(document.body.innerText),
    undefined,
    { timeout: 300_000 }
  );
  mark("status_has_presentation");

  await page
    .waitForFunction(
      () => !/Havok WASM|물리 씬 로딩|Havok 물리 엔진/.test(document.body.innerText),
      undefined,
      { timeout: 300_000 }
    )
    .catch(() => undefined);
  mark("havok_message_gone");

  await page.waitForFunction(
    () => {
      const canvas = document.querySelector(".showcase-viewport-wrap canvas");
      return canvas instanceof HTMLCanvasElement && canvas.width > 0;
    },
    undefined,
    { timeout: 300_000 }
  );
  mark("canvas_ready");

  const perf = await page.evaluate(() => {
    const resources = performance.getEntriesByType("resource");
    const wasm = resources.find((r) => r.name.includes("HavokPhysics.wasm"));
    const heavy = resources
      .filter(
        (r) =>
          r.name.includes("HavokPhysics") ||
          r.name.includes("@babylonjs") ||
          r.name.includes("createShowcasePhysicsScene") ||
          r.name.includes("weddingChapel") ||
          r.name.includes(".mp4")
      )
      .map((r) => ({
        name: r.name.split("/").slice(-2).join("/"),
        ms: Math.round(r.duration),
        kb: r.transferSize ? Math.round(r.transferSize / 1024) : null,
      }))
      .sort((a, b) => b.ms - a.ms)
      .slice(0, 12);
    return {
      wasmMs: wasm ? Math.round(wasm.duration) : null,
      wasmTransferKb: wasm?.transferSize ? Math.round(wasm.transferSize / 1024) : null,
      statusLine: document.body.innerText.match(/\d+장 · [^\n]+/)?.[0] ?? null,
      loadingSpinner: !!document.querySelector(".animate-spin"),
      heavy,
    };
  });
  mark("done");

  await context.close();
  return { label, totalMs: Date.now() - t0, marks, earlyPerf, perf };
}

const run1 = await runPass("run_1");
const run2 = await runPass("run_2");

await browser.close();

console.log(JSON.stringify({ run1, run2 }, null, 2));
