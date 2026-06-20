#!/usr/bin/env node
/**
 * Inspect VoluMax prep + UI state on cube tab.
 */
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

const beforePlate = await page.evaluate(() => ({
  voluMaxDepth: document.querySelector('input[type="checkbox"]')?.checked,
  body: document.body.innerText.slice(0, 2500),
}));

await page
  .getByText(/VoluMax 적용 \d+\/\d+면|VoluMax matte|배경 플레이트/)
  .first()
  .waitFor({ timeout: 120_000 })
  .catch(() => {});

const uiState = await page.evaluate(() => {
  const checks = Array.from(document.querySelectorAll('input[type="checkbox"]')).map((el) => {
    const label = el.closest("label")?.innerText?.trim() ?? el.parentElement?.innerText?.trim() ?? "";
    return { label: label.slice(0, 80), checked: el.checked };
  });
  return {
    checks,
    hasVoluMaxMsg: /VoluMax/.test(document.body.innerText),
    voluMaxAppliedLine:
      document.body.innerText.match(/VoluMax 적용 \d+\/\d+면/)?.[0] ?? null,
    hasPlateMsg: /플레이트|matte/i.test(document.body.innerText),
    snippet: document.body.innerText.match(/VoluMax[^\n]*/g)?.slice(0, 6) ?? [],
  };
});

await page.getByRole("checkbox", { name: /3D 홀로그램 팬 모드/ }).check();
await page.getByRole("checkbox", { name: /VoluMax 깊이 분리/ }).check().catch(() => {});
await page.getByRole("checkbox", { name: /VoluMax 무드 FX/ }).check().catch(() => {});
await page.getByRole("button", { name: /연출 적용/ }).first().click();
await page.waitForTimeout(6000);

await page.screenshot({ path: join(root, "experiments/outputs/volumax_verify.png"), fullPage: false });

const canvasStats = await page.evaluate(() => {
  const canvas = document.querySelector("canvas");
  if (!canvas) return { err: "no canvas" };
  const w = canvas.width;
  const h = canvas.height;
  const tmp = document.createElement("canvas");
  tmp.width = w;
  tmp.height = h;
  const ctx = tmp.getContext("2d");
  ctx.drawImage(canvas, 0, 0);
  const cx = Math.floor(w * 0.5);
  const cy = Math.floor(h * 0.5);
  const r = 60;
  const center = ctx.getImageData(cx - r, cy - r, r * 2, r * 2).data;
  const edge = ctx.getImageData(20, 20, 40, 40).data;
  let cSkin = 0;
  let cBlur = 0;
  let eBright = 0;
  const n = center.length / 4;
  for (let i = 0; i < center.length; i += 4) {
    const r0 = center[i];
    const g0 = center[i + 1];
    const b0 = center[i + 2];
    if (r0 > 100 && g0 > 70 && b0 > 50 && r0 > g0) cSkin++;
    if (r0 + g0 + b0 > 180 && Math.abs(r0 - g0) < 30) cBlur++;
  }
  for (let i = 0; i < edge.length; i += 4) {
    if (edge[i] + edge[i + 1] + edge[i + 2] > 200) eBright++;
  }
  return {
    w,
    h,
    centerSkinRatio: +(cSkin / n).toFixed(3),
    centerBlurRatio: +(cBlur / n).toFixed(3),
    edgeBrightRatio: +(eBright / (edge.length / 4)).toFixed(3),
  };
});

console.log(
  JSON.stringify(
    {
      beforePlateSnippet: beforePlate.body.includes("VoluMax"),
      uiState,
      canvasStats,
      screenshot: join(root, "experiments/outputs/volumax_verify.png"),
    },
    null,
    2
  )
);

await browser.close();
