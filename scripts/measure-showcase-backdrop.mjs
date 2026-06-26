#!/usr/bin/env node
import { chromium } from "playwright";

const url = process.argv[2] ?? "http://localhost:5175/showcase";
const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--ignore-gpu-blocklist", "--enable-webgl"],
});
const page = await browser.newPage();
const t0 = Date.now();
const log = (label) => console.log(`${Date.now() - t0}ms\t${label}`);

log("goto");
await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120_000 });
log("domcontentloaded");

await page.waitForLoadState("load");
log("load");

const backdrop = await page.evaluate(() => {
  const v = document.querySelector("video.showcase-dom-backdrop");
  if (!(v instanceof HTMLVideoElement)) return { found: false };
  return {
    found: true,
    readyState: v.readyState,
    vw: v.videoWidth,
    src: v.currentSrc?.slice(-60),
  };
});
log(`backdrop ${JSON.stringify(backdrop)}`);

await page.waitForFunction(
  () => {
    const v = document.querySelector("video.showcase-dom-backdrop");
    return v instanceof HTMLVideoElement && v.readyState >= 2 && v.videoWidth > 0;
  },
  undefined,
  { timeout: 120_000 }
).catch(() => log("backdrop timeout"));

log("backdrop ready");

const resources = await page.evaluate(() =>
  performance
    .getEntriesByType("resource")
    .filter((r) => r.transferSize > 50_000 || r.name.includes("wasm") || r.name.includes(".mp4"))
    .map((r) => ({
      name: r.name.split("/").slice(-3).join("/"),
      ms: Math.round(r.duration),
      kb: Math.round((r.transferSize || 0) / 1024),
    }))
    .sort((a, b) => b.kb - a.kb)
);
log(`large resources: ${JSON.stringify(resources, null, 0)}`);

await browser.close();
