#!/usr/bin/env node
/**
 * Live E2E: photo upload → inner cube texture attachment.
 *   npm run verify:showcase-upload-e2e
 *
 * Requires dev server: npm run dev
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { WEB_URL } from "./lib/dev-ports.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const testImage = join(root, "data/showcase-qa-corpus/qa_005_portrait.jpg");

const useSwiftShader =
  process.env.MBOX_USE_SWIFTSHADER !== "0" && process.env.MBOX_USE_SWIFTSHADER !== "false";

function targetUrl() {
  const base = process.env.MBOX_SHOWCASE_URL ?? `${WEB_URL}/showcase.html`;
  const url = new URL(base);
  url.searchParams.set("localOnly", "1");
  url.searchParams.set("fullGpu", "1");
  url.searchParams.set("companionTarget", "1");
  url.searchParams.set("noPhysics", "1");
  url.searchParams.set("shape", "cube");
  url.searchParams.set("look", "rose_gold_premium");
  url.searchParams.set("bg", "solid_black");
  return url.toString();
}

function shellUrl() {
  const base = process.env.MBOX_SHOWCASE_URL ?? `${WEB_URL}/showcase.html`;
  const url = new URL(base);
  url.searchParams.set("look", "rose_gold_premium");
  url.searchParams.set("bg", "solid_black");
  return url.toString();
}

async function waitForDevServer() {
  const probe = process.env.MBOX_SHOWCASE_URL ?? `${WEB_URL}/showcase.html`;
  const res = await fetch(probe, { signal: AbortSignal.timeout(8_000) });
  if (!res.ok) {
    throw new Error(`dev server not ready: ${res.status}`);
  }
}

async function waitForUploadAudit(page, label, timeoutMs = 120_000) {
  await page.waitForFunction(
    () => typeof window.__MBOX_SHOWCASE_UPLOAD_AUDIT__ === "function",
    undefined,
    { timeout: timeoutMs }
  );
  await page.waitForFunction(
    () => {
      const audit = window.__MBOX_SHOWCASE_UPLOAD_AUDIT__?.();
      return audit?.pass === true;
    },
    undefined,
    { timeout: timeoutMs, polling: 500 }
  );
  const audit = await page.evaluate(() => window.__MBOX_SHOWCASE_UPLOAD_AUDIT__?.());
  console.log(`✓ ${label}`, audit?.checks?.map((c) => `${c.id}=${c.pass}`).join(", "));
  return audit;
}

async function testDirectTargetUpload(browser) {
  const context = await browser.newContext({ viewport: { width: 1080, height: 1080 } });
  await context.addInitScript(() => {
    window.__MBOX_SHOWCASE_E2E__ = true;
  });
  const page = await context.newPage();
  const url = targetUrl();
  console.log(`\nDirect target: ${url}`);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
  const upload = page.locator('[data-testid="showcase-photo-upload"]');
  await upload.waitFor({ state: "attached", timeout: 30_000 });
  await upload.setInputFiles([testImage]);
  await waitForUploadAudit(page, "direct target upload");
  await context.close();
}

async function testCompanionShellSync(browser) {
  const shellContext = await browser.newContext({ viewport: { width: 900, height: 900 } });
  const targetContext = await browser.newContext({ viewport: { width: 1080, height: 1080 } });
  await targetContext.addInitScript(() => {
    window.__MBOX_SHOWCASE_E2E__ = true;
  });

  const shellPage = await shellContext.newPage();
  const targetPage = await targetContext.newPage();

  const tUrl = targetUrl();
  console.log(`\nCompanion target: ${tUrl}`);
  await targetPage.goto(tUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await targetPage.waitForFunction(
    () => typeof window.__MBOX_SHOWCASE_UPLOAD_AUDIT__ === "function",
    undefined,
    { timeout: 120_000 }
  );

  const sUrl = shellUrl();
  console.log(`Companion shell: ${sUrl}`);
  await shellPage.goto(sUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
  const shellUpload = shellPage.locator('[data-testid="showcase-photo-upload"]');
  await shellUpload.waitFor({ state: "attached", timeout: 30_000 });
  await shellUpload.setInputFiles([testImage]);

  await waitForUploadAudit(targetPage, "companion shell → target sync", 120_000);
  await shellContext.close();
  await targetContext.close();
}

async function main() {
  if (!existsSync(testImage)) {
    throw new Error(`missing test image: ${testImage}`);
  }

  await waitForDevServer();

  const browser = await chromium.launch({
    headless: process.env.MBOX_HEADED !== "1",
    args: [
      ...(useSwiftShader
        ? ["--use-gl=swiftshader", "--enable-webgl"]
        : ["--use-gl=angle", "--ignore-gpu-blocklist", "--enable-webgl"]),
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding",
    ],
  });

  try {
    await testDirectTargetUpload(browser);
    await testCompanionShellSync(browser);
    console.log("\nverify-showcase-upload-e2e: OK");
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error("FAIL:", error instanceof Error ? error.message : error);
  process.exit(1);
});
