#!/usr/bin/env node
/**
 * Browser E2E: showcase MP4 export + automatic verification.
 *
 * Usage (repo root):
 *   node scripts/e2e-showcase-export.mjs
 *
 * Env:
 *   MBOX_SHOWCASE_URL — default hosted showcase.html
 *   MBOX_RECORD_TIMEOUT_MS — export wait (default 120000)
 *   MBOX_HEADED=1 — visible browser
 */
import { existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import {
  centerYavg,
  cornerYavg,
  ffprobeDuration,
  ffprobeWxH,
} from "./measure-composite-kpi.mjs";
import { WEB_URL } from "./lib/dev-ports.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const defaultLocalUrl = `${WEB_URL}/showcase.html?localOnly=1&fullGpu=1&noPhysics=1&look=modern_black&bg=solid_black`;
const testImage = join(root, "data/showcase-qa-corpus/qa_005_portrait.jpg");

const SHOWCASE_URL =
  process.env.MBOX_SHOWCASE_URL ??
  (WEB_URL.includes("localhost") || WEB_URL.includes("127.0.0.1")
    ? defaultLocalUrl
    : "https://storage.googleapis.com/mbox-web-newmedia-496107/showcase.html");

const RECORD_TIMEOUT_MS = Number(process.env.MBOX_RECORD_TIMEOUT_MS ?? 120_000);
/** Booth square export — matches SHOWCASE_DEVICE_EXPORT_SIZE (2160²). */
const TARGET_SIZE = Number(process.env.MBOX_EXPORT_SIZE ?? 2160);
const useSwiftShader =
  process.env.MBOX_USE_SWIFTSHADER !== "0" && process.env.MBOX_USE_SWIFTSHADER !== "false";

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

const context = await browser.newContext({ acceptDownloads: true });
await context.addInitScript(() => {
  window.__MBOX_E2E_EXPORT__ = true;
  window.__MBOX_SHOWCASE_AUTOMATION__ = true;
});

const page = await context.newPage();
const consoleErrors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});
page.on("pageerror", (err) => consoleErrors.push(String(err)));

function fail(message) {
  throw new Error(message);
}

async function samplePreviewBackdropLuma() {
  return page.evaluate(() => {
    const video = document.querySelector(
      ".showcase-viewport-wrap video.showcase-dom-backdrop"
    );
    if (!(video instanceof HTMLVideoElement) || video.videoWidth <= 0) {
      return null;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0);
    const w = Math.max(8, Math.floor(canvas.width * 0.22));
    const h = Math.max(8, Math.floor(canvas.height * 0.22));
    const x = Math.floor((canvas.width - w) * 0.5);
    const y = Math.floor((canvas.height - h) * 0.5);
    const data = ctx.getImageData(x, y, w, h).data;
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) {
      sum += data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722;
    }
    return sum / (data.length / 4);
  });
}

try {
  console.log(`Opening ${SHOWCASE_URL}`);
  const response = await page.goto(SHOWCASE_URL, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  if (!response?.ok()) fail(`Showcase load failed: ${response?.status()}`);

  const uploadInput = page.locator('[data-testid="showcase-photo-upload"]');
  if (existsSync(testImage) && (await uploadInput.count())) {
    await uploadInput.setInputFiles([testImage]);
  }

  await page.waitForFunction(
    () => {
      const btn = Array.from(document.querySelectorAll("button")).find((b) =>
        /MP4/i.test(b.textContent ?? "")
      );
      return btn && !btn.disabled;
    },
    undefined,
    { timeout: 90_000 }
  );

  const previewLuma = await samplePreviewBackdropLuma();
  console.log("Preview backdrop center luma:", previewLuma);

  const mp4Button = page.getByRole("button", { name: /MP4/i });
  if (await mp4Button.isDisabled()) {
    fail("MP4 button still disabled after wait");
  }

  const downloadPromise = page.waitForEvent("download", { timeout: RECORD_TIMEOUT_MS });
  await mp4Button.click();

  await page
    .getByText(/다운로드 완료|MP4 생성 실패|배경 영상/i)
    .first()
    .waitFor({ timeout: RECORD_TIMEOUT_MS })
    .catch(() => undefined);

  const download = await downloadPromise;
  const inPagePayload = await page.evaluate(() => window.__MBOX_LAST_SHOWCASE_EXPORT__);
  const suggested = download.suggestedFilename();
  const outDir = mkdtempSync(join(tmpdir(), "mbox-showcase-e2e-"));
  const outPath = join(outDir, suggested);
  await download.saveAs(outPath);
  const size = statSync(outPath).size;

  console.log("Download:", suggested, `${size} bytes`);

  const wxh = ffprobeWxH(outPath);
  const durationSec = ffprobeDuration(outPath);
  const centerY = centerYavg(outPath, 0.25);
  const cornerY = cornerYavg(outPath, 0.25);

  const report = {
    file: outPath,
    filename: suggested,
    bytes: size,
    ffprobe: { ...wxh, durationSec, centerYavg: centerY, cornerYavg: cornerY },
    inPageVerification: inPagePayload?.verification ?? null,
    previewBackdropLuma: previewLuma,
    consoleErrors,
  };

  writeFileSync(join(outDir, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));

  if (!/\.(mp4|webm)$/i.test(suggested)) {
    fail(`Unexpected extension: ${suggested}`);
  }
  if (size < 80_000) {
    fail(`File too small: ${size} bytes`);
  }
  if (!wxh || wxh.width !== TARGET_SIZE || wxh.height !== TARGET_SIZE) {
    fail(`Resolution mismatch: ${wxh?.width}×${wxh?.height} (expected ${TARGET_SIZE}²)`);
  }
  if (!durationSec || durationSec < 5) {
    fail(`Duration too short: ${durationSec}s`);
  }
  if (centerY == null || centerY < 22) {
    fail(`Export center luma too dark (${centerY}) — background likely missing`);
  }
  if (inPagePayload?.verification && !inPagePayload.verification.passed) {
    fail(`In-page verification failed: ${inPagePayload.verification.errors.join("; ")}`);
  }
  const wysiwyg = inPagePayload?.verification?.wysiwyg;
  if (wysiwyg && !wysiwyg.passed) {
    fail(`WYSIWYG verification failed: ${wysiwyg.errors.join("; ")}`);
  }
  if (wysiwyg?.passed) {
    console.log(
      `WYSIWYG OK: center Δluma ${wysiwyg.centerLumaDelta.toFixed(1)}, rgb Δ ${wysiwyg.rgbDelta.toFixed(1)}`
    );
  } else if (previewLuma != null && centerY != null && Math.abs(previewLuma - centerY) > 80) {
    console.warn(
      `WARN: legacy preview/export luma delta ${Math.abs(previewLuma - centerY).toFixed(1)} (preview ${previewLuma.toFixed(1)}, export ${centerY.toFixed(1)})`
    );
  }

  console.log("\ne2e-showcase-export: OK");
  console.log(`Report: ${join(outDir, "report.json")}`);
} catch (error) {
  console.error("\ne2e-showcase-export: FAIL");
  console.error(error instanceof Error ? error.message : error);
  if (consoleErrors.length) {
    console.error("Console errors:", consoleErrors.slice(0, 8).join("\n"));
  }
  process.exitCode = 1;
} finally {
  await browser.close();
}
