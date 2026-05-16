import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const WEB_URL = process.env.WEB_URL ?? "http://127.0.0.1:5174";
const out = join(dirname(fileURLToPath(import.meta.url)), "..", "experiments", "outputs", "debug_batch_live.log");
const lines = [];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
page.on("pageerror", (e) => errors.push(String(e)));

await page.goto(WEB_URL, { waitUntil: "domcontentloaded" });
await page.getByRole("button", { name: /data\/asset 배치/ }).click();

for (let i = 0; i < 36; i++) {
  const status = await page.locator("p.italic, [class*='text-slate']").allTextContents().catch(() => []);
  const body = await page.locator("body").innerText();
  const line = `[${i * 10}s] ${body.split("\n").find((l) => /data\/asset|배치|오류|크롭|분석|완료/.test(l)) ?? "(no status line)"}`;
  lines.push(line);
  if (body.includes("배치 처리가 완료") || body.includes("배치 처리 중 오류")) break;
  await page.waitForTimeout(10_000);
}

lines.push("--- console errors ---", ...errors.slice(0, 12));
writeFileSync(out, lines.join("\n"));
console.log(lines.join("\n"));
await browser.close();
