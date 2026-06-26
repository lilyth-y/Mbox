#!/usr/bin/env node
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const url =
  process.env.MBOX_SHOWCASE_URL ??
  "http://127.0.0.1:4176/showcase.html?localOnly=1&look=rose_gold_premium&bg=solid_black";

const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--use-gl=angle", "--ignore-gpu-blocklist", "--enable-webgl"],
});
const page = await browser.newPage({ viewport: { width: 1080, height: 1080 } });
const logs = [];
page.on("console", (m) => {
  const t = m.text();
  if (/WebGL|context|shader|BJS|showcase/i.test(t)) logs.push(t);
});

await page.goto(url, { waitUntil: "load", timeout: 120_000 });

for (let step = 0; step < 30; step++) {
  const s = await page.evaluate((stepIndex) => {
    const c = document.querySelector("canvas.showcase-canvas");
    const gl = c?.getContext("webgl2") || c?.getContext("webgl");
    const body = document.body.innerText;
    return {
      i: stepIndex,
      status: body.match(/\d+장 · [^\n]+/)?.[0] ?? body.match(/표출[^\n]+/)?.[0],
      error: body.includes("WebGL은 시작됐지만"),
      lost: gl?.isContextLost?.() ?? null,
      stage: body.match(/표출|회전|정면|복귀/)?.[0],
    };
  }, step);
  console.log(JSON.stringify(s));
  if (s.error || s.lost) break;
  await page.waitForTimeout(2000);
}
console.log("--- logs ---");
console.log(logs.slice(-20).join("\n"));
await browser.close();
