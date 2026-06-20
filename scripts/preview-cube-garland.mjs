#!/usr/bin/env node
/**
 * Hologram cube face garland preview (PNG ornaments on border).
 * Usage: npm run dev  then  npm run preview:cube-garland
 */
import { chromium } from "playwright";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { waitForApiReady } from "./lib/wait-for-api.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const WEB_URL = process.env.WEB_URL ?? "http://localhost:5173";
const headless = process.env.HEADLESS !== "0";

const sampleImages = [
  "Clouds_01.png",
  "Clouds_02.png",
  "Clouds_03.png",
  "Clouds_04.png",
  "Clouds_05.png",
  "Clouds_06.png",
].map((name) => join(root, "apps/web/public/cs5/volumax/clouds", name));

for (const file of sampleImages) {
  if (!existsSync(file)) {
    console.error("Missing sample image:", file);
    process.exit(1);
  }
}

const ornamentDir = join(root, "apps/web/public/assets/fan-blade-ornaments");
for (const kind of ["rose", "pearl", "leaf", "filigree", "star", "sparkle"]) {
  if (!existsSync(join(ornamentDir, `${kind}.png`))) {
    console.error("Missing ornament PNG — run: npm run generate:fan-blade-ornaments");
    process.exit(1);
  }
}

const shotsDir = join(root, "experiments", "outputs", "cube_garland_preview");
mkdirSync(shotsDir, { recursive: true });

console.log("Waiting for API + web...");
await waitForApiReady(process.env.API_URL ?? "http://127.0.0.1:8787", 120_000);

for (let attempt = 0; attempt < 60; attempt += 1) {
  try {
    const res = await fetch(WEB_URL, { method: "HEAD" });
    if (res.ok) break;
  } catch {
    /* retry */
  }
  await new Promise((r) => setTimeout(r, 1000));
}

const browser = await chromium.launch({
  headless,
  args: ["--use-gl=angle", "--ignore-gpu-blocklist", "--enable-webgl", "--disable-gpu-sandbox"],
});

const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });

try {
  console.log("Opening", WEB_URL);
  await page.goto(WEB_URL, { waitUntil: "domcontentloaded", timeout: 60_000 });

  await page.getByRole("button", { name: "프로세싱" }).click();
  await page.getByRole("button", { name: "1. 사진 원본" }).click();
  await page.locator('input[type="file"]').setInputFiles(sampleImages);
  await page.getByRole("button", { name: /분석·크롭 시작/ }).click();

  console.log("Processing images...");
  await page.waitForFunction(
    () => /처리 완료|보관함/.test(document.body.innerText) && !document.body.innerText.includes("분석 중"),
    undefined,
    { timeout: 180_000 }
  );

  await page.getByRole("button", { name: /3D 큐브/ }).click();
  await page.getByText(/재생 \d+장/).waitFor({ timeout: 60_000 });

  await page.locator("label").filter({ hasText: "3D 홀로그램 팬 모드" }).locator('input[type="checkbox"]').check();

  const optionalModules = ["홀로그램 Fresnel rim", "Selective bloom"];
  for (const label of optionalModules) {
    const box = page.locator("label").filter({ hasText: label }).locator('input[type="checkbox"]');
    if (!(await box.isChecked())) {
      await box.check();
    }
  }

  await page.getByRole("button", { name: "연출 적용 (재생 처음부터)" }).click();
  await page.waitForTimeout(2500);

  const canvas = page.locator("canvas").first();
  const paths = [
    join(shotsDir, "garland_front.png"),
    join(shotsDir, "garland_rotated.png"),
  ];
  await canvas.screenshot({ path: paths[0] });
  console.log("Captured", paths[0]);

  await page.waitForTimeout(4000);
  await canvas.screenshot({ path: paths[1] });
  console.log("Captured", paths[1]);

  if (!headless) {
    console.log("Browser open 60s — inspect garland on face borders.");
    await page.waitForTimeout(60_000);
  }
} finally {
  await browser.close();
}

console.log("Done →", shotsDir);
