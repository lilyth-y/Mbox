#!/usr/bin/env node
/**
 * Crystal showcase: upload real photos + local backdrop MP4, export MP4, report KPIs.
 *
 * Usage:
 *   node scripts/render-showcase-real-photos.mjs
 *
 * Env:
 *   MBOX_WEB_BASE_URL — default http://localhost:5173
 *   MBOX_RECORD_TIMEOUT_MS — default 300000
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import {
  centerYavg,
  cornerYavg,
  ffprobeDuration,
  ffprobeWxH,
} from "./measure-composite-kpi.mjs";
import { loadEnvLocal } from "./lib/load-env-local.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
loadEnvLocal(root);

const WEB_BASE = (process.env.MBOX_WEB_BASE_URL ?? "http://localhost:5173").replace(/\/$/, "");
const RECORD_TIMEOUT_MS = Number(process.env.MBOX_RECORD_TIMEOUT_MS ?? 300_000);
const OUT_DIR = join(root, ".cursor", "render-preview");

const PHOTOS = [
  join(root, "data/showcase-qa-corpus/qa_005_portrait.jpg"),
  join(root, "data/showcase-qa-corpus/qa_021_landscape.jpg"),
  join(root, "data/showcase-qa-corpus/qa_012_square.jpg"),
];

const BACKDROP = encodeURIComponent("배경동영상/mf001.mp4");
const SHOWCASE_URL = `${WEB_BASE}/showcase.html?backdrop=${BACKDROP}&bg=booth&shape=cube`;

const DEMO_BASELINE = join(
  root,
  "apps/api/data/render-jobs/outputs/render-1782139395450-8ph4carn.mp4"
);

function ffprobeBitrate(file) {
  const r = spawnSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=bit_rate",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      file,
    ],
    { encoding: "utf8" }
  );
  if (r.status !== 0) return null;
  const bps = parseInt(r.stdout.trim(), 10);
  return Number.isFinite(bps) ? Math.round(bps / 1_000_000 * 10) / 10 : null;
}

function analyzeMp4(file) {
  const wxh = ffprobeWxH(file);
  const durationSec = ffprobeDuration(file);
  const size = statSync(file).size;
  return {
    file,
    bytes: size,
    mb: Math.round((size / 1_024 / 1_024) * 10) / 10,
    durationSec,
    width: wxh?.width,
    height: wxh?.height,
    centerYavg: centerYavg(file, 0.25),
    cornerYavg: cornerYavg(file, 0.25),
    bitrateMbps: ffprobeBitrate(file),
  };
}

async function samplePreviewBackdropLuma(page) {
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

function extractFrame(mp4, atSec, outJpg) {
  spawnSync(
    "ffmpeg",
    ["-y", "-ss", String(atSec), "-i", mp4, "-frames:v", "1", "-q:v", "2", outJpg],
    { stdio: "ignore" }
  );
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const t0 = Date.now();

  const browser = await chromium.launch({
    headless: process.env.MBOX_HEADED !== "1",
    args: [
      "--use-gl=angle",
      "--ignore-gpu-blocklist",
      "--enable-webgl",
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding",
      "--disable-dev-shm-usage",
      "--autoplay-policy=no-user-gesture-required",
    ],
  });

  const context = await browser.newContext({ acceptDownloads: true });
  await context.addInitScript(() => {
    window.__MBOX_E2E_EXPORT__ = true;
  });
  const page = await context.newPage();

  console.log("Opening", SHOWCASE_URL);
  const response = await page.goto(SHOWCASE_URL, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  if (!response?.ok()) {
    throw new Error(`Showcase load failed: ${response?.status()}`);
  }

  await page.waitForSelector('input[type="file"][accept="image/*"]', { timeout: 30_000 });
  const uploadMs = Date.now();
  await page.locator('input[type="file"][accept="image/*"][multiple]').setInputFiles(PHOTOS);
  console.log("Uploaded", PHOTOS.map((p) => p.split("/").pop()).join(", "));

  await page.waitForFunction(
    () => {
      const btn = Array.from(document.querySelectorAll("button")).find((b) =>
        /MP4/i.test(b.textContent ?? "")
      );
      return btn && !btn.disabled;
    },
    undefined,
    { timeout: RECORD_TIMEOUT_MS }
  );
  const readyMs = Date.now() - uploadMs;
  const previewLuma = await samplePreviewBackdropLuma(page);
  console.log("MP4 ready after upload:", `${(readyMs / 1000).toFixed(1)}s`, "preview luma:", previewLuma);

  const mp4Button = page.getByRole("button", { name: /MP4/i });
  const exportStart = Date.now();
  const downloadPromise = page.waitForEvent("download", { timeout: RECORD_TIMEOUT_MS });
  await mp4Button.click();

  await page
    .getByText(/다운로드 완료|MP4 생성 실패|배경 영상/i)
    .first()
    .waitFor({ timeout: RECORD_TIMEOUT_MS })
    .catch(() => undefined);

  const download = await downloadPromise;
  const exportMs = Date.now() - exportStart;
  const outPath = join(OUT_DIR, "crystal-real-photos-backdrop.mp4");
  await download.saveAs(outPath);
  const inPage = await page.evaluate(() => window.__MBOX_LAST_SHOWCASE_EXPORT__).catch(() => null);
  await browser.close();

  const totalMs = Date.now() - t0;
  const real = analyzeMp4(outPath);
  const baseline = existsSync(DEMO_BASELINE) ? analyzeMp4(DEMO_BASELINE) : null;

  for (const sec of [8, 22, 35]) {
    extractFrame(outPath, sec, join(OUT_DIR, `real-photos-t${sec}s.jpg`));
  }

  const report = {
    scenario: "real photos (3 QA corpus) + 배경동영상/mf001.mp4",
    photos: PHOTOS,
    showcaseUrl: SHOWCASE_URL,
    timings: {
      totalSec: Math.round(totalMs / 100) / 10,
      uploadToReadySec: Math.round(readyMs / 100) / 10,
      exportSec: Math.round(exportMs / 100) / 10,
    },
    previewBackdropLuma: previewLuma,
    output: real,
    baselineDemoNoBackdrop: baseline,
    inPageVerification: inPage?.verification ?? null,
  };

  writeFileSync(join(OUT_DIR, "real-photos-report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  console.log("\nrender-showcase-real-photos: OK");
  console.log("MP4:", outPath);
  console.log("Frames:", join(OUT_DIR, "real-photos-t{8,22,35}s.jpg"));
}

main().catch((error) => {
  console.error("render-showcase-real-photos: FAIL", error);
  process.exit(1);
});
