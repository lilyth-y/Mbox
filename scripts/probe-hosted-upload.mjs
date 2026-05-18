import { readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const WEB_URL =
  process.env.MBOX_WEB_URL ??
  "https://mbox-web-newmedia-496107.storage.googleapis.com/index.html";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const assetDir = join(root, "data/asset/temp_1778692001076.-1818431043");
const images = readdirSync(assetDir)
  .filter((n) => n.endsWith(".jpg"))
  .slice(0, 3)
  .map((n) => join(assetDir, n));

const errors = [];
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});

await page.goto(WEB_URL, { waitUntil: "domcontentloaded" });
const hasBatch = await page.getByRole("button", { name: /data\/asset 배치/ }).isVisible().catch(() => false);
console.log("hasDataAssetBatchButton:", hasBatch);

await page.locator('input[type="file"]').setInputFiles(images);
await page.getByRole("button", { name: /분석·크롭 시작/ }).click();

for (let i = 0; i < 36; i++) {
  await page.waitForTimeout(10_000);
  const t = await page.locator("body").innerText();
  const status =
    t.split("\n").find((l) => /처리|분석|오류|완료|실패|업로드/.test(l) && l.length < 120) ??
    "(idle)";
  console.log(`+${(i + 1) * 10}s: ${status.slice(0, 100)}`);
  if (/분석·크롭이 완료|처리 중 오류|배치 처리 중 오류/.test(t)) break;
}

console.log("console errors:", errors.slice(0, 6));
await browser.close();
