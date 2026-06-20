#!/usr/bin/env node
/** Enable VoluMax opt-in on wedding-simple and verify layers after AI (1 image). */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const WEB_URL =
  process.env.WEB_URL ??
  `http://localhost:5173/wedding-simple/index.html?_=${Date.now()}`;
const sample =
  [
    join(root, "wedding_2d_input.jpg"),
    join(root, "PR_deck/brosher/assets/wedding/image1.png"),
  ].find((p) => existsSync(p)) ?? null;

if (!sample) {
  console.error("No sample image found");
  process.exit(1);
}

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--ignore-gpu-blocklist", "--enable-webgl"],
});
const page = await browser.newPage();
await page.goto(WEB_URL, { waitUntil: "domcontentloaded", timeout: 60_000 });

await page.locator('input[type="file"]').first().setInputFiles([sample, sample, sample]);
await page.waitForSelector("#selected-images-wrap:not(.hidden)", { timeout: 15_000 });

await page.evaluate(() => {
  document.querySelectorAll(".volumax-depth-cb").forEach((el) => {
    el.checked = true;
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
  document.querySelectorAll(".volumax-auto-cb").forEach((el) => {
    el.checked = true;
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
});
const opts = await page.evaluate(() => ({
  depth: document.querySelector(".volumax-depth-cb")?.checked,
  auto: document.querySelector(".volumax-auto-cb")?.checked,
}));
if (!opts.depth || !opts.auto) {
  throw new Error(`VoluMax options not set: ${JSON.stringify(opts)}`);
}

await page.locator("#start-ai-btn").click();

await page.waitForFunction(
  () => {
    const step3 = document.getElementById("step-3-view");
    return step3 && !step3.classList.contains("hidden");
  },
  undefined,
  { timeout: 300_000 }
);

await page.waitForSelector("#canvas-container canvas", { timeout: 60_000 });
await page.waitForTimeout(2000);

const debug = await page.evaluate(() => window.mboxGetPresentationDebug?.());
console.log("debug:", JSON.stringify(debug, null, 2));

const status = await page.evaluate(() => {
  const el = document.getElementById("volumax-status");
  const text = el?.textContent?.trim() ?? "";
  const match = text.match(/VoluMax\s+(\d+)\/(\d+)/);
  return { text, prepared: match ? Number(match[1]) : 0, total: match ? Number(match[2]) : 0 };
});

await browser.close();

console.log("volumax-option-smoke:", status);
if (!/^VoluMax\s+[1-9]\d*\//.test(status.text)) {
  console.error("Expected VoluMax N/N면 status, got:", status.text);
  process.exit(1);
}
console.log("verify-volumax-option-smoke: OK");
