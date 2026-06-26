#!/usr/bin/env node
import { chromium } from "playwright";
import { appendFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const logPath = join(root, "debug-6299d2.log");
const baseUrl = process.argv[2] ?? "http://localhost:5173/showcase.html";
const testImage = join(root, "data/showcase-qa-corpus/qa_005_portrait.jpg");

function writeLog(entry) {
  appendFileSync(logPath, `${JSON.stringify({ sessionId: "6299d2", ...entry, timestamp: Date.now() })}\n`);
}

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=egl", "--ignore-gpu-blocklist", "--enable-webgl", "--disable-gpu-sandbox"],
});
const page = await browser.newPage();

page.on("console", (msg) => {
  const text = msg.text();
  if (/CONTEXT|WebGL|context lost|6299|BJS -/i.test(text)) {
    writeLog({
      location: "playwright:console",
      message: "browser_console",
      hypothesisId: "A",
      data: { type: msg.type(), text: text.slice(0, 400) },
      runId: "playwright",
    });
  }
});

writeLog({ location: "debug-webgl-6299.mjs", message: "run_start", hypothesisId: "A", data: { baseUrl }, runId: "playwright" });

await page.goto(baseUrl, { waitUntil: "load", timeout: 120_000 });
const fileInput = page.locator('input[type="file"]').first();
if (await fileInput.count()) {
  await fileInput.setInputFiles([testImage]);
}

const samples = [];
for (let i = 0; i < 12; i++) {
  await page.waitForTimeout(2500);
    const sample = await page.evaluate(() => {
      const text = document.body.innerText;
      const status =
        text.match(/WebGL[^\n]+/)?.[0] ??
        text.match(/\d+장 · [^\n]+/)?.[0] ??
        null;
      const overlay = document.querySelector(".absolute.inset-0.z-10");
      const canvas = document.querySelector("canvas.showcase-canvas");
      let canvasNonBlack = false;
      if (canvas && canvas.width > 0) {
        const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
        if (gl) {
          const pixels = new Uint8Array(4);
          gl.readPixels(
            Math.floor(canvas.width / 2),
            Math.floor(canvas.height / 2),
            1,
            1,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            pixels
          );
          canvasNonBlack = pixels[0] + pixels[1] + pixels[2] > 24;
        }
      }
      return {
        status,
        webglRecoveringOverlay: Boolean(overlay),
        gpuRecoveringBadge: Boolean(document.body.innerText.includes("GPU 복구 중")),
        overlayClasses: overlay?.className ?? null,
        canvasWidth: canvas?.width ?? 0,
        canvasHeight: canvas?.height ?? 0,
        hasSpinner: Boolean(overlay?.querySelector(".animate-spin")),
        canvasNonBlack,
      };
    });
  samples.push({ tSec: (i + 1) * 2.5, ...sample });
  writeLog({
    location: "debug-webgl-6299.mjs",
    message: "sample",
    hypothesisId: "A",
    data: sample,
    runId: "playwright",
  });
}

const dbgEntries = await page.evaluate(() => {
  return window.__dbg6299 ?? [];
});
writeLog({
  location: "debug-webgl-6299.mjs",
  message: "browser_dbg_buffer",
  hypothesisId: "A",
  data: { entries: dbgEntries },
  runId: "playwright",
});

await browser.close();
writeLog({
  location: "debug-webgl-6299.mjs",
  message: "run_end",
  hypothesisId: "A",
  data: { sampleCount: samples.length, last: samples.at(-1), dbgCount: dbgEntries.length },
  runId: "playwright",
});
console.log(JSON.stringify({ logPath, samples, dbgEntries }, null, 2));
