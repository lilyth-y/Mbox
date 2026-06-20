#!/usr/bin/env node
import { chromium } from "playwright";
import { readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { waitForApiReady } from "./lib/wait-for-api.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const assetDir = join(root, "data", "asset", "temp_1778692001076.-1818431043");
const jpgs = readdirSync(assetDir)
  .filter((f) => /^KakaoTalk_.*\.jpg$/i.test(f))
  .sort()
  .slice(0, 6)
  .map((f) => join(assetDir, f));

await waitForApiReady("http://127.0.0.1:8787", 120_000);
const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--ignore-gpu-blocklist", "--enable-webgl"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
await page.goto("http://localhost:5173", { waitUntil: "domcontentloaded" });
await page.getByRole("button", { name: "프로세싱" }).click();
await page.locator('input[type="file"]').setInputFiles(jpgs);
await page.getByRole("button", { name: /분석·크롭 시작/ }).click();
await page.waitForFunction(
  () => /처리 완료|보관함/.test(document.body.innerText) && !document.body.innerText.includes("분석 중"),
  undefined,
  { timeout: 600_000 }
);
await page.getByRole("button", { name: /3D 큐브/ }).click();
await page.getByText(/재생 6장/).waitFor({ timeout: 60_000 });
await page.getByRole("checkbox", { name: /3D 홀로그램 팬 모드/ }).check();
await page.getByRole("button", { name: /금가루|Gold/ }).first().click();
await page.getByRole("button", { name: /연출 적용/ }).first().click();
await page
  .getByText(/배경 플레이트가 준비|VoluMax 연출:/)
  .first()
  .waitFor({ timeout: 120_000 })
  .catch(() => {});
await page.waitForTimeout(5000);

const info = await page.evaluate(() => {
  const canvas = document.querySelector("canvas");
  if (!canvas) return { err: "no canvas" };
  const w = canvas.width;
  const h = canvas.height;
  const tmp = document.createElement("canvas");
  tmp.width = w;
  tmp.height = h;
  const ctx = tmp.getContext("2d");
  ctx.drawImage(canvas, 0, 0);
  const full = ctx.getImageData(0, 0, w, h).data;
  let n = 0;
  let rs = 0;
  let gs = 0;
  let bs = 0;
  let sumL = 0;
  let sumL2 = 0;
  let slateHits = 0;
  let brightHits = 0;
  let skinHits = 0;
  for (let i = 0; i < full.length; i += 16) {
    const r0 = full[i];
    const g0 = full[i + 1];
    const b0 = full[i + 2];
    rs += r0;
    gs += g0;
    bs += b0;
    const l = 0.2126 * r0 + 0.7152 * g0 + 0.0722 * b0;
    sumL += l;
    sumL2 += l * l;
    n += 1;
    if (r0 >= 45 && r0 <= 58 && g0 >= 58 && g0 <= 72 && b0 >= 78 && b0 <= 92) slateHits++;
    if (r0 + g0 + b0 > 220) brightHits++;
    if (r0 > 120 && g0 > 80 && b0 > 60 && r0 > g0) skinHits++;
  }
  const meanL = sumL / n;
  const varL = sumL2 / n - meanL * meanL;
  const text = document.body.innerText;
  return {
    w,
    h,
    avgRgb: [Math.round(rs / n), Math.round(gs / n), Math.round(bs / n)],
    varL: +varL.toFixed(2),
    slateHits,
    brightHits,
    skinHits,
    hasPlate: /플레이트|VoluMax 연출/.test(text),
    snippet: text.slice(text.indexOf("재생"), text.indexOf("재생") + 120),
  };
});

console.log(JSON.stringify(info, null, 2));
await browser.close();
