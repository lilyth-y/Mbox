#!/usr/bin/env node
/**
 * Playwright smoke: media presets, overlap hints, BGM HEAD, VoluMax header wiring.
 */
import { chromium } from "playwright";

const WEB_URL = process.env.WEB_URL ?? "http://localhost:5173";
let failed = 0;

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  failed++;
}

function pass(msg) {
  console.log(`OK: ${msg}`);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

try {
  // BGM assets
  for (const file of [
    "cinematic-romantic.mp3",
    "piano-slideshow.mp3",
    "romantic-wedding.mp3",
    "bridal-chorus.mp3",
  ]) {
    const res = await page.request.head(`${WEB_URL}/bgm/${file}`);
    if (!res.ok()) fail(`BGM ${file} HTTP ${res.status()}`);
    else pass(`BGM ${file} (${res.headers()["content-length"]} bytes)`);
  }

  // Main app — cube tab media UI
  await page.goto(`${WEB_URL}/`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.getByRole("button", { name: /3D 큐브/ }).click();
  await page.getByText("추천 조합").waitFor({ timeout: 30_000 });
  pass("Cube tab — 추천 조합 visible");
  await page.getByText("겹침 힌트").waitFor({ timeout: 10_000 });
  pass("Cube tab — 겹침 힌트 visible");
  await page.getByText("사진 중심").click();
  pass("Cube tab — preset click 사진 중심");
  const volumaxHeader = page.locator('[data-testid="volumax-status-header"]');
  if ((await volumaxHeader.count()) < 1) fail("VoluMax status header missing on cube tab");
  else pass("Cube tab — VoluMaxStatusHeader present");

  // Wedding — step 1 load
  await page.goto(`${WEB_URL}/wedding-simple/`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.getByRole("heading", { name: "웨딩 사진 업로드" }).waitFor({ timeout: 30_000 });
  pass("Wedding — step 1 upload screen");
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
} finally {
  await browser.close();
}

if (failed > 0) {
  console.error(`verify-media-ui-smoke: ${failed} failure(s)`);
  process.exit(1);
}
console.log("verify-media-ui-smoke: PASS");
