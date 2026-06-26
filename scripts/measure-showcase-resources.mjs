#!/usr/bin/env node
/**
 * Profile showcase init phases + network/scene GPU estimates.
 * Usage: node scripts/measure-showcase-resources.mjs [showcaseUrl] [--wait-jewel-ms=20000]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const rawArg = process.argv[2]?.startsWith("http") ? process.argv[2] : null;
const waitJewelMs = Number(
  process.argv.find((a) => a.startsWith("--wait-jewel-ms="))?.split("=")[1] ?? 20_000
);
const urlObj = new URL(rawArg ?? "http://127.0.0.1:4176/showcase.html");
urlObj.searchParams.set("profile", "1");
urlObj.searchParams.set("localOnly", "1");
const url = urlObj.toString();
const testImage = join(root, "data/showcase-qa-corpus/qa_005_portrait.jpg");
const outDir = join(root, "experiments");
const outPath = join(outDir, "showcase-resource-profile.json");

mkdirSync(outDir, { recursive: true });

const useSwiftShader =
  process.env.MBOX_USE_SWIFTSHADER !== "0" && process.env.MBOX_USE_SWIFTSHADER !== "false";

const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: useSwiftShader
    ? ["--use-gl=swiftshader", "--enable-webgl"]
    : ["--use-gl=angle", "--ignore-gpu-blocklist", "--enable-webgl"],
});

const context = await browser.newContext({ viewport: { width: 1080, height: 1080 } });
await context.addInitScript(() => {
  window.__MBOX_SHOWCASE_E2E__ = true;
  window.__MBOX_SHOWCASE_AUTOMATION__ = true;
});
const page = await context.newPage();
const consoleLines = [];
let contextLost = false;
page.on("console", (msg) => {
  const text = msg.text();
  if (/context lost|CONTEXT_LOST/i.test(text)) {
    contextLost = true;
  }
  if (text.includes("[showcase] resource report")) {
    consoleLines.push(text);
  }
});

await page.goto(url, { waitUntil: "load", timeout: 120_000 });

const uploadInput = page.locator('[data-testid="showcase-photo-upload"]');
await uploadInput.waitFor({ state: "attached", timeout: 30_000 });
await uploadInput.setInputFiles([testImage]);

// Windows upload-first: wait until preview images are applied before profiling jewel_spawn.
try {
  await page.waitForFunction(
    () => /\d+장 ·/.test(document.body.innerText),
    { timeout: 60_000 }
  );
} catch {
  // continue — may still have partial report
}

const deadline = Date.now() + waitJewelMs;
let report = null;
while (Date.now() < deadline) {
  report = await page.evaluate(() => window.__MBOX_SHOWCASE_RESOURCE_REPORT__ ?? null);
  const hasJewel = report?.phases?.some((p) => p.phase === "jewel_spawn");
  if (hasJewel) {
    break;
  }
  if (report?.phases?.length && !report.phases.some((p) => p.phase === "jewel_spawn")) {
    // director/stable_frames done — jewel may arrive soon
  }
  await page.waitForTimeout(500);
}

const ui = await page.evaluate(() => {
  const canvas = document.querySelector("canvas.showcase-canvas");
  let nonBlack = false;
  if (canvas && canvas.width > 0) {
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    if (gl && !gl.isContextLost()) {
      const p = new Uint8Array(4);
      gl.readPixels(
        Math.floor(canvas.width / 2),
        Math.floor(canvas.height / 2),
        1,
        1,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        p
      );
      nonBlack = p[0] + p[1] + p[2] > 24;
    }
  }
  const body = document.body.innerText;
  return {
    error: body.includes("WebGL은 시작됐지만") || body.includes("WebGL 컨텍스트"),
    status: body.match(/\d+장 · [^\n]+/)?.[0] ?? body.match(/미리보기[^\n]+/)?.[0] ?? null,
    canvas: canvas ? { w: canvas.width, h: canvas.height } : null,
    nonBlack,
    snippet: body.slice(0, 400),
  };
});

await browser.close();

const payload = {
  url,
  waitJewelMs,
  contextLost,
  ui,
  report,
  measuredAt: new Date().toISOString(),
};

writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(JSON.stringify(payload, null, 2));
console.log(`\nWrote ${outPath}`);
