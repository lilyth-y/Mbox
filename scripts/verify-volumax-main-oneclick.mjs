#!/usr/bin/env node
/** Main app: upload → cube tab → VoluMax one-click (AI cutout + depth). */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { waitForApiReady } from "./lib/wait-for-api.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const WEB = process.env.WEB_URL ?? "http://localhost:5173";
const sample =
  [join(root, "wedding_2d_input.jpg"), join(root, "PR_deck/brosher/assets/wedding/image1.png")].find(
    (p) => existsSync(p)
  ) ?? null;

if (!sample) {
  console.error("No sample image");
  process.exit(1);
}

await waitForApiReady("http://127.0.0.1:8787", 60_000);

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--ignore-gpu-blocklist", "--enable-webgl"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });

try {
  await page.goto(WEB, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.getByRole("button", { name: "프로세싱" }).click();
  await page.locator('input[type="file"]').setInputFiles([sample, sample, sample]);
  await page.getByRole("button", { name: /분석·크롭 시작/ }).click();
  await page.waitForFunction(
    () => /처리 완료|보관함/.test(document.body.innerText) && !document.body.innerText.includes("분석 중"),
    undefined,
    { timeout: 300_000 }
  );

  await page.getByRole("button", { name: /3D 큐브/ }).click();
  await page.getByText(/재생 3장|재생 [1-9]/).waitFor({ timeout: 60_000 });

  await page.getByRole("button", { name: /VoluMax 입체감 원클릭/ }).click();
  await page.waitForFunction(
    () =>
      /VoluMax 원클릭 완료/.test(document.body.innerText) ||
      /AI 누끼가 없습니다/.test(document.body.innerText) ||
      /VoluMax 준비 실패/.test(document.body.innerText),
    undefined,
    { timeout: 180_000 }
  );

  const snap = await page.evaluate(() => ({
    snippets: (document.body.innerText.match(/VoluMax[^\n]*/g) ?? []).slice(0, 12),
    cutoutLine: document.body.innerText.match(/누끼 \d+\/\d+장/)?.[0] ?? null,
    recording: document.body.innerText.match(/VoluMax 원클릭[^\n]*/)?.[0] ?? null,
    softWarn: /소프트 matte|AI 누끼가 없습니다/.test(document.body.innerText),
    depthOn: Array.from(document.querySelectorAll("label")).some((label) => {
      if (!/VoluMax 깊이 분리/.test(label.innerText)) return false;
      return label.querySelector('input[type="checkbox"]')?.checked === true;
    }),
    hasCanvas: Boolean(document.querySelector("canvas")),
  }));

  console.log(JSON.stringify(snap, null, 2));

  const cutoutMatch = snap.cutoutLine?.match(/누끼 (\d+)\/(\d+)장/);
  const cutoutN = cutoutMatch ? Number(cutoutMatch[1]) : 0;
  const cutoutTotal = cutoutMatch ? Number(cutoutMatch[2]) : 0;
  const pass =
    snap.depthOn &&
    snap.hasCanvas &&
    !snap.softWarn &&
    cutoutN >= 3 &&
    cutoutN === cutoutTotal &&
    /VoluMax 원클릭 완료/.test(snap.recording ?? "");

  if (!pass) {
    console.error("verify-volumax-main-oneclick: FAIL");
    process.exit(1);
  }
  console.log("verify-volumax-main-oneclick: OK", snap.recording, snap.cutoutLine);
} finally {
  await browser.close();
}
