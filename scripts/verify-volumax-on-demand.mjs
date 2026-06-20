#!/usr/bin/env node
/** Depth ON after AI — on-demand layer build without re-upload (React wedding-simple). */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const WEB_URL =
  process.env.WEB_URL ??
  `http://localhost:5173/wedding-simple.html?_=${Date.now()}`;
const sample =
  [join(root, "wedding_2d_input.jpg"), join(root, "PR_deck/brosher/assets/wedding/image1.png")].find(
    (p) => existsSync(p)
  ) ?? null;

if (!sample) {
  console.error("No sample image");
  process.exit(1);
}

function voluMaxStatusReady(text) {
  return /VoluMax AI 누끼\s+[1-9]\d*\/\d+면/.test(text || "");
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto(WEB_URL, { waitUntil: "domcontentloaded", timeout: 60_000 });

await page.locator('input[type="file"]').first().setInputFiles([sample, sample, sample]);
await page.waitForSelector("#start-ai-btn:not([disabled])", { timeout: 15_000 });

await page.locator("#start-ai-btn").click();
await page.waitForSelector("#step-3-view", { timeout: 300_000 });

await page.waitForFunction(
  () => {
    const t = document.querySelector('[data-testid="volumax-status-header"]')?.textContent || "";
    return /VoluMax AI 누끼\s+[1-9]\d*\/\d+면/.test(t);
  },
  undefined,
  { timeout: 300_000 }
);

await page.evaluate(() => {
  const label = [...document.querySelectorAll("p")].find((p) =>
    p.textContent?.includes("VoluMax 깊이 분리")
  );
  const input = label?.closest("div.rounded-2xl")?.querySelector('input[type="checkbox"]');
  if (input instanceof HTMLInputElement) {
    input.checked = false;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.checked = true;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }
});

await page.waitForTimeout(500);

const status = await page.evaluate(
  () => document.querySelector('[data-testid="volumax-status-header"]')?.textContent
);
await browser.close();
console.log("on-demand status:", status);
if (!voluMaxStatusReady(status)) {
  process.exit(1);
}
console.log("verify-volumax-on-demand: OK");
