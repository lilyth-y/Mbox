#!/usr/bin/env node
/**
 * Reproduce showcase upload → crystal photo display.
 * Prereq: npm run dev (web :5173, api :8787)
 */
import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { WEB_URL } from "./lib/dev-ports.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const url =
  `${WEB_URL}/showcase.html?crystalColor=ebebeb&crystalTrans=0&_=${Date.now()}`;

const logs = [];
const errors = [];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

page.on("console", (msg) => {
  const line = `[${msg.type()}] ${msg.text()}`;
  logs.push(line);
  if (msg.type() === "error") errors.push(line);
});

page.on("pageerror", (err) => {
  errors.push(`[pageerror] ${err.message}`);
});

await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120_000 });

// Tiny 64x64 red JPEG as upload
const jpegB64 =
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDABALDA4MChAODQ4SERATGCgaGBgWGTEpJR0pKS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLP/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAr/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA8A/9k=";
const tmpPath = join(root, "experiments", "outputs", "debug-upload.jpg");
writeFileSync(tmpPath, Buffer.from(jpegB64, "base64"));

await page.waitForTimeout(8000);

const statusBefore = await page.locator("text=/장 ·|Havok|데모|업로드/").first().textContent().catch(() => "");

const fileInput = page.locator('label:has-text("사진 업로드") input[type="file"]');
await fileInput.setInputFiles(tmpPath);

await page.waitForTimeout(15000);

const statusAfter = await page.locator("text=/장 ·|텍스처|업로드|분석/").first().textContent().catch(() => "");
const bodySnippet = (await page.locator("body").innerText()).slice(0, 500);

await page.screenshot({
  path: join(root, "experiments", "outputs", "debug-showcase-upload.png"),
  fullPage: false,
});

await browser.close();

console.log("URL:", url);
console.log("Status before:", statusBefore);
console.log("Status after:", statusAfter);
console.log("Body snippet:", bodySnippet.replace(/\s+/g, " ").slice(0, 200));
console.log("\nConsole errors:", errors.length ? errors.join("\n") : "(none)");
console.log("\nRelevant logs:");
for (const line of logs.filter((l) => /showcase|holo|preload|upload|texture|401|failed/i.test(l))) {
  console.log(line);
}

process.exit(errors.length > 0 ? 1 : 0);
