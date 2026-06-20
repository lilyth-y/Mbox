#!/usr/bin/env node
/** Debug main app VoluMax one-click — logs UI state on timeout. */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { waitForApiReady } from "./lib/wait-for-api.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sample =
  [join(root, "wedding_2d_input.jpg"), join(root, "PR_deck/brosher/assets/wedding/image1.png")].find(
    (p) => existsSync(p)
  ) ?? null;

await waitForApiReady("http://127.0.0.1:8787", 60_000);
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });

await page.goto("http://localhost:5173/", { waitUntil: "domcontentloaded", timeout: 60_000 });
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

const before = await page.evaluate(() => ({
  hasOneClick: Boolean(
    Array.from(document.querySelectorAll("button")).find((b) =>
      /VoluMax 입체감 원클릭/.test(b.textContent || "")
    )
  ),
  buttons: Array.from(document.querySelectorAll("button"))
    .map((b) => b.textContent?.trim())
    .filter((t) => t && /VoluMax|누끼|레이어|준비/.test(t)),
  msgs: document.body.innerText.match(/VoluMax[^\n]*/g)?.slice(0, 8) ?? [],
}));
console.log("before click:", JSON.stringify(before, null, 2));

await page.getByRole("button", { name: /VoluMax 입체감 원클릭/ }).click();

for (let i = 0; i < 36; i += 1) {
  await page.waitForTimeout(5000);
  const snap = await page.evaluate(() => ({
    preparing: /준비 중|적용 중|누끼|AI/.test(document.body.innerText),
    snippets: document.body.innerText.match(/VoluMax[^\n]*/g)?.slice(0, 10) ?? [],
    recording: document.body.innerText.match(/VoluMax[^\n]{0,80}/g)?.slice(-3) ?? [],
    cutout: document.body.innerText.match(/누끼 \d+\/\d+장/)?.[0] ?? null,
  }));
  console.log(`t+${(i + 1) * 5}s`, JSON.stringify(snap));
  if (/VoluMax 원클릭 완료|레이어 준비 완료|AI 누끼가 없습니다|VoluMax 준비 실패/.test(snap.snippets.join(" "))) break;
}

await browser.close();
