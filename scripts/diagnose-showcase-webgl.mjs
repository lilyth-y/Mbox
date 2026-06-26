#!/usr/bin/env node
/**
 * Diagnose showcase WebGL / context loss (ANGLE ≈ real Chrome on Windows).
 */
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const testImage = join(root, "data/showcase-qa-corpus/qa_005_portrait.jpg");
const useSwiftShader = process.env.MBOX_USE_SWIFTSHADER === "1";
const url =
  process.env.MBOX_SHOWCASE_URL ??
  "http://127.0.0.1:4176/showcase.html?localOnly=1&profile=1&look=rose_gold_premium&bg=solid_black";

const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: useSwiftShader
    ? ["--use-gl=swiftshader", "--enable-webgl"]
    : ["--use-gl=angle", "--ignore-gpu-blocklist", "--enable-webgl"],
});

const context = await browser.newContext({ viewport: { width: 1080, height: 1080 } });
const page = await context.newPage();
const logs = [];
page.on("console", (msg) => {
  const t = msg.text();
  if (/showcase|WebGL|context|BJS|error|warn/i.test(t)) logs.push(`[${msg.type()}] ${t}`);
});
page.on("pageerror", (err) => logs.push(`[pageerror] ${err}`));

const gl = useSwiftShader ? "swiftshader" : "angle";
console.log(`\n=== diagnose (${gl}) ===\n${url}\n`);

const response = await page.goto(url, { waitUntil: "load", timeout: 120_000 });
console.log("HTTP", response?.status());

await page.waitForTimeout(3000);

const beforeUpload = await page.evaluate(() => ({
  body: document.body.innerText.slice(0, 500),
  canvas: (() => {
    const c = document.querySelector("canvas.showcase-canvas");
    return c ? { w: c.width, h: c.height, client: [c.clientWidth, c.clientHeight] } : null;
  })(),
  report: window.__MBOX_SHOWCASE_RESOURCE_REPORT__ ?? null,
  contextLost: (() => {
    const c = document.querySelector("canvas.showcase-canvas");
    const gl = c?.getContext("webgl2") || c?.getContext("webgl");
    return gl?.isContextLost?.() ?? null;
  })(),
}));

console.log("\n--- after load (demo, no upload) ---");
console.log(JSON.stringify(beforeUpload, null, 2));

const upload = page.locator('[data-testid="showcase-photo-upload"]');
const uploadCount = await upload.count();
console.log("\nupload input count:", uploadCount);

if (uploadCount > 0) {
  await upload.setInputFiles([testImage]);
  const deadline = Date.now() + 90_000;
  const samples = [];
  while (Date.now() < deadline) {
    const snap = await page.evaluate(() => {
      const c = document.querySelector("canvas.showcase-canvas");
      const gl = c?.getContext("webgl2") || c?.getContext("webgl");
      const report = window.__MBOX_SHOWCASE_RESOURCE_REPORT__ ?? null;
      const audit = window.__MBOX_SHOWCASE_SHAPE_AUDIT__?.();
      return {
        t: Date.now(),
        status: document.body.innerText.match(/\d+장 · [^\n]+/)?.[0] ?? null,
        error: document.body.innerText.includes("WebGL은 시작됐지만"),
        contextLost: gl?.isContextLost?.() ?? null,
        phases: report?.phases?.map((p) => p.phase) ?? null,
        hasJewel: report?.phases?.some((p) => p.phase === "jewel_spawn") ?? false,
        stage: audit?.snapshot?.stageId ?? null,
        phaseMs: audit?.snapshot?.phaseElapsedMs ?? null,
        canvasLuma: (() => {
          if (!c || !gl || gl.isContextLost?.()) return null;
          const px = new Uint8Array(4);
          gl.readPixels(
            Math.floor(c.width / 2),
            Math.floor(c.height / 2),
            1,
            1,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            px
          );
          return px[0] + px[1] + px[2];
        })(),
      };
    });
    samples.push(snap);
    if (snap.error || snap.contextLost === true) break;
    if (snap.hasJewel && (snap.canvasLuma ?? 0) > 20) break;
    await page.waitForTimeout(1000);
  }
  console.log("\n--- upload timeline (last 8) ---");
  console.log(JSON.stringify(samples.slice(-8), null, 2));
}

const final = await page.evaluate(() => ({
  errorBlock: document.body.innerText.includes("WebGL은 시작됐지만"),
  help: document.body.innerText.match(/WebGL[^\n]+/)?.[0] ?? null,
  status: document.body.innerText.match(/\d+장 · [^\n]+/)?.[0] ?? null,
  report: window.__MBOX_SHOWCASE_RESOURCE_REPORT__ ?? null,
}));

console.log("\n--- final ---");
console.log(JSON.stringify(final, null, 2));
console.log("\n--- console tail ---");
console.log(logs.slice(-25).join("\n"));

await browser.close();
