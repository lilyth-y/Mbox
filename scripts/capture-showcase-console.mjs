#!/usr/bin/env node
import { chromium } from "playwright";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const baseUrl = process.argv[2] ?? "http://localhost:5175/showcase";
const testImage = join(root, "data/showcase-qa-corpus/qa_005_portrait.jpg");

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--ignore-gpu-blocklist", "--enable-webgl"],
});
const page = await browser.newPage();

const consoleLogs = [];
const pageErrors = [];
const failedRequests = [];

page.on("console", (msg) => {
  consoleLogs.push({
    type: msg.type(),
    text: msg.text(),
    location: msg.location(),
  });
});
page.on("pageerror", (err) => {
  pageErrors.push(String(err));
});
page.on("requestfailed", (req) => {
  failedRequests.push({
    url: req.url().slice(-120),
    failure: req.failure()?.errorText ?? "unknown",
  });
});

console.log(`Opening ${baseUrl} ...`);
await page.goto(baseUrl, { waitUntil: "load", timeout: 120_000 });
await page.waitForTimeout(3000);

const fileInput = page.locator('label:has-text("사진 업로드") input[type="file"]');
if (await fileInput.count()) {
  await fileInput.setInputFiles([testImage]);
  await page.waitForFunction(
    () => /\d+장 ·/.test(document.body.innerText),
    undefined,
    { timeout: 120_000 }
  ).catch(() => undefined);
  await page.waitForTimeout(5000);
}

const status = await page.evaluate(() => ({
  statusLine: document.body.innerText.match(/\d+장 · [^\n]+/)?.[0] ?? null,
  errors: document.body.innerText.match(/실패|오류|error/gi)?.slice(0, 5) ?? [],
  backdropError: document.querySelector(".showcase-dom-backdrop-error")?.textContent?.trim() ?? null,
}));

await browser.close();

const errors = consoleLogs.filter((l) => l.type === "error");
const warnings = consoleLogs.filter((l) => l.type === "warning");
const logs = consoleLogs.filter((l) => l.type === "log" || l.type === "info" || l.type === "debug");

console.log("\n=== PAGE STATUS ===");
console.log(JSON.stringify(status, null, 2));

console.log(`\n=== CONSOLE ERRORS (${errors.length}) ===`);
for (const e of errors) {
  console.log(`[error] ${e.text}`);
  if (e.location?.url) console.log(`        at ${e.location.url}:${e.location.lineNumber}`);
}

console.log(`\n=== CONSOLE WARNINGS (${warnings.length}) ===`);
for (const w of warnings.slice(0, 30)) {
  console.log(`[warning] ${w.text}`);
}
if (warnings.length > 30) console.log(`... +${warnings.length - 30} more warnings`);

console.log(`\n=== PAGE ERRORS (${pageErrors.length}) ===`);
for (const e of pageErrors) console.log(e);

console.log(`\n=== FAILED REQUESTS (${failedRequests.length}) ===`);
for (const r of failedRequests) console.log(`${r.failure}: ${r.url}`);

console.log(`\n=== RECENT LOGS (last 20) ===`);
for (const l of logs.slice(-20)) {
  console.log(`[${l.type}] ${l.text}`);
}

console.log(`\nTotal console messages: ${consoleLogs.length}`);
