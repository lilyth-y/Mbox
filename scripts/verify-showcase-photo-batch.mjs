#!/usr/bin/env node
/**
 * Commercial photo_batch_100 gate — rose_gold_premium preset upload audit on fixed corpus.
 *
 *   npm run verify:showcase-photo-batch
 *   MBOX_PHOTO_BATCH_LIMIT=10 npm run verify:showcase-photo-batch
 *
 * Requires dev server: npm run dev
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { WEB_URL } from "./lib/dev-ports.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const corpusDir = join(root, "data/showcase-qa-corpus");
const reportDir = join(root, "experiments/showcase-commercial-goals");
const reportPath = join(reportDir, "photo-batch-latest.json");

const limit = Number(process.env.MBOX_PHOTO_BATCH_LIMIT ?? 100);
const timeoutPerImageMs = Number(process.env.MBOX_PHOTO_BATCH_TIMEOUT_MS ?? 45_000);
const jsonOut = process.argv.includes("--json");

const useSwiftShader =
  process.env.MBOX_USE_SWIFTSHADER !== "0" && process.env.MBOX_USE_SWIFTSHADER !== "false";

function buildShowcaseUrl() {
  const base = process.env.MBOX_SHOWCASE_URL ?? `${WEB_URL}/showcase.html`;
  const url = new URL(base);
  url.searchParams.set("localOnly", "1");
  url.searchParams.set("fullGpu", "1");
  url.searchParams.set("noPhysics", "1");
  url.searchParams.set("shape", "cube");
  url.searchParams.set("look", "rose_gold_premium");
  url.searchParams.set("bg", "solid_black");
  url.searchParams.delete("backdrop");
  return url.toString();
}

async function waitForDevServer() {
  const probe = process.env.MBOX_SHOWCASE_URL ?? `${WEB_URL}/showcase.html`;
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(probe, { signal: AbortSignal.timeout(8_000) });
      if (res.ok) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error("dev server not ready — run npm run dev");
}

function listCorpusImages() {
  if (!existsSync(corpusDir)) {
    throw new Error(`Missing corpus dir: ${corpusDir}`);
  }
  return readdirSync(corpusDir)
    .filter((f) => /\.(jpe?g|png|webp)$/i.test(f))
    .sort((a, b) => a.localeCompare(b))
    .slice(0, limit)
    .map((file) => join(corpusDir, file));
}

await waitForDevServer();
const images = listCorpusImages();
if (images.length < Math.min(limit, 100)) {
  throw new Error(`Corpus too small (${images.length}) — run npm run generate:showcase-qa-corpus`);
}

const browser = await chromium.launch({
  headless: process.env.MBOX_HEADED !== "1",
  args: [
    ...(useSwiftShader
      ? ["--use-gl=swiftshader", "--enable-webgl"]
      : ["--use-gl=angle", "--ignore-gpu-blocklist", "--enable-webgl"]),
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
    "--disable-gpu-sandbox",
  ],
});

const perImage = [];
const consoleErrors = [];

try {
  const context = await browser.newContext({ viewport: { width: 1080, height: 1080 } });
  await context.addInitScript(() => {
    window.__MBOX_SHOWCASE_E2E__ = true;
    window.__MBOX_SHOWCASE_AUTOMATION__ = true;
  });
  const page = await context.newPage();
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  const url = buildShowcaseUrl();
  console.log(`Photo batch preset-only: ${images.length} images`);
  console.log(`URL: ${url}`);

  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
  const upload = page.locator('[data-testid="showcase-photo-upload"]');
  await upload.waitFor({ state: "attached", timeout: 30_000 });

  await page.waitForFunction(
    () => typeof window.__MBOX_SHOWCASE_UPLOAD_AUDIT__ === "function",
    undefined,
    { timeout: 120_000 }
  );

  for (let i = 0; i < images.length; i += 1) {
    const imagePath = images[i];
    const fileName = imagePath.split(/[/\\]/).pop() ?? imagePath;
    let passed = false;
    let audit = null;
    let error = null;

    try {
      await upload.setInputFiles([imagePath]);
      await page.waitForFunction(
        () => {
          const fn = window.__MBOX_SHOWCASE_UPLOAD_AUDIT__;
          if (!fn) return false;
          const result = fn();
          return result?.pass === true;
        },
        undefined,
        { timeout: timeoutPerImageMs, polling: 300 }
      );
      audit = await page.evaluate(() => window.__MBOX_SHOWCASE_UPLOAD_AUDIT__?.());
      passed = audit?.pass === true;
    } catch (err) {
      error = String(err);
      try {
        audit = await page.evaluate(() => window.__MBOX_SHOWCASE_UPLOAD_AUDIT__?.());
      } catch {
        /* ignore */
      }
    }

    perImage.push({ file: fileName, passed, audit, error });
    const mark = passed ? "PASS" : "FAIL";
    console.log(`${mark} [${i + 1}/${images.length}] ${fileName}${error ? ` — ${error.slice(0, 80)}` : ""}`);
    if (!passed && audit?.checks) {
      const failed = audit.checks.filter((c) => !c.pass).map((c) => c.id);
      if (failed.length) console.log(`       failed: ${failed.join(", ")}`);
    }
  }

  await context.close();
} finally {
  await browser.close();
}

const passCount = perImage.filter((p) => p.passed).length;
const total = perImage.length;
const passRate = total > 0 ? passCount / total : 0;

const payload = {
  at: new Date().toISOString(),
  mode: "preset_only_upload_audit",
  preset: "rose_gold_premium",
  shapeId: "cube",
  passCount,
  failCount: total - passCount,
  total,
  passRate,
  perImage: perImage.map(({ file, passed, error }) => ({ file, passed, error })),
  consoleErrors: consoleErrors.slice(0, 20),
};

mkdirSync(reportDir, { recursive: true });
writeFileSync(reportPath, JSON.stringify(payload, null, 2));

if (jsonOut) {
  console.log(JSON.stringify(payload, null, 2));
} else {
  console.log(`\nphoto batch: ${passCount}/${total} (${(passRate * 100).toFixed(1)}%)`);
  console.log(`Report: ${reportPath}`);
}

process.exit(passRate >= 1 ? 0 : 1);
