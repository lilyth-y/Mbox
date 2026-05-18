import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readdirSync } from "node:fs";
import { chromium } from "playwright";

const WEB_URL =
  "https://mbox-web-newmedia-496107.storage.googleapis.com/index.html";
const assetDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "data/asset/temp_1778692001076.-1818431043",
);
const image = join(assetDir, readdirSync(assetDir).find((n) => n.endsWith(".jpg")) ?? "");

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const logs = [];
page.on("console", (m) => logs.push(`[${m.type()}] ${m.text()}`));

await page.goto(WEB_URL, { waitUntil: "domcontentloaded" });
await page.locator('input[type="file"]').setInputFiles([image]);
await page.getByRole("button", { name: /분석·크롭 시작/ }).click();

for (let i = 0; i < 24; i++) {
  await page.waitForTimeout(5_000);
  const status = await page.locator("p.italic").first().innerText().catch(() => "");
  const progress = await page.locator('[class*="ProcessingProgress"]').first().innerText().catch(() => "");
  console.log(`+${(i + 1) * 5}s status=${status.slice(0, 80)}`);
  if (/완료|오류|실패/.test(status)) break;
}
console.log("console tail:", logs.filter((l) => l.includes("error") || l.includes("failed")).slice(0, 8));
await browser.close();
