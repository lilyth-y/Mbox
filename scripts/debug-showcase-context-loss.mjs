#!/usr/bin/env node
/**
 * Trace WebGL CONTEXT_LOST vs showcase init phases (local GPU export path).
 */
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ensureWindowsDiscreteGpuPreference,
  findChromeExecutable,
  resolveChromeDiscreteGpuArgs,
} from "./chrome-discrete-gpu.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const url =
  process.env.MBOX_WEB_URL?.trim() ||
  "http://localhost:5173/showcase.html?localOnly=1&fullGpu=1&look=rose_gold_premium&bg=solid_black&noPhysics=1";

const chromePath = findChromeExecutable();
if (chromePath) ensureWindowsDiscreteGpuPreference(chromePath);

const timeline = [];
const log = (event, data = {}) => {
  const entry = { t: Date.now(), event, ...data };
  timeline.push(entry);
  console.log(JSON.stringify(entry));
};

const browser = await chromium.launch({
  channel: "chrome",
  headless: process.env.MBOX_HEADED === "1" ? false : true,
  args: resolveChromeDiscreteGpuArgs(),
});
const context = await browser.newContext();
await context.addInitScript(() => {
  window.__MBOX_LOCAL_GPU_EXPORT__ = true;
  window.__MBOX_E2E_EXPORT__ = true;
  window.__MBOX_SHOWCASE_PROFILE__ = true;
  window.__MBOX_CTX_TIMELINE__ = [];
  window.__MBOX_CTX_TIMELINE__.push({ t: performance.now(), event: "init_script" });
});
const page = await context.newPage();

page.on("console", (msg) => {
  const text = msg.text();
  if (/context lost|CONTEXT_LOST|WebGL context|jewel|showcase\] resource/i.test(text)) {
    log("console", { type: msg.type(), text: text.slice(0, 240) });
  }
});

await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120_000 });
log("goto_done");

for (let i = 0; i < 60; i++) {
  const snap = await page.evaluate(() => {
    const report = window.__MBOX_SHOWCASE_RESOURCE_REPORT__;
    const canvas = document.querySelector("canvas");
    let glLost = null;
    if (canvas) {
      const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
      glLost = gl?.isContextLost?.() ?? null;
    }
    const btn = [...document.querySelectorAll("button")].find((b) => /MP4/i.test(b.textContent ?? ""));
    return {
      phases: report?.phases?.map((p) => `${p.phase}@${p.ms}ms`) ?? [],
      gpuTier: report?.gpuTier ?? null,
      totalInitMs: report?.totalInitMs ?? null,
      glLost,
      ready: Boolean(btn && !btn.disabled),
      status: document.body.innerText.match(/준비|복구|WebGL|GPU|장 ·/g)?.slice(0, 3) ?? [],
    };
  });
  log("poll", { i, ...snap });
  if (snap.ready) break;
  await page.waitForTimeout(1000);
}

const outPath = join(root, "scripts", "outputs", `context-loss-debug-${Date.now()}.json`);
writeFileSync(outPath, JSON.stringify({ url, timeline }, null, 2));
console.log("Wrote", outPath);
await browser.close();
