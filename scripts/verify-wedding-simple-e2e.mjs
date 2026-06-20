import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { waitForApiReady } from "./lib/wait-for-api.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "experiments", "outputs");
const sessionDir = join(outDir, "wedding_simple_e2e_session");
const shotsDir = join(sessionDir, "screenshots");
const logPath = join(sessionDir, "process_log.md");
const resultPath = join(sessionDir, "download_result.json");

const API_URL = process.env.API_URL ?? "http://localhost:8787";
const API_READY_TIMEOUT_MS = Number(process.env.API_READY_TIMEOUT_MS ?? 120_000);
const SKIP_MP4 = process.env.MBOX_SKIP_MP4 === "1";

const rawWebUrl =
  process.env.WEB_URL ??
  (process.env.MBOX_WEDDING_SIMPLE_FILE === "1"
    ? `file:///${root.replace(/\\/g, "/")}/wedding-simple/index.html`
    : "http://localhost:5173/wedding-simple/index.html");
const WEB_URL = rawWebUrl.includes("?")
  ? `${rawWebUrl}&api_url=${encodeURIComponent(API_URL)}`
  : `${rawWebUrl}?api_url=${encodeURIComponent(API_URL)}`;

const logLines = [];
const log = (msg) => {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  logLines.push(line);
};

async function shot(page, name) {
  const path = join(shotsDir, `${name}.png`);
  await page.screenshot({ path, fullPage: true });
  log(`screenshot: ${name}`);
  return path;
}

async function measureCanvasPaint(page, selector = "canvas") {
  return await page.evaluate((sel) => {
    const canvas = document.querySelector(sel);
    if (!(canvas instanceof HTMLCanvasElement)) {
      return { ok: false, reason: `missing canvas for selector ${sel}` };
    }
    const w = Math.max(1, Math.floor(canvas.width));
    const h = Math.max(1, Math.floor(canvas.height));
    const tmp = document.createElement("canvas");
    tmp.width = w;
    tmp.height = h;
    const ctx = tmp.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      return { ok: false, reason: "no 2d ctx" };
    }
    ctx.drawImage(canvas, 0, 0);
    const img = ctx.getImageData(0, 0, w, h).data;
    const step = Math.max(1, Math.floor(Math.min(w, h) / 64));
    let n = 0;
    let nonBlack = 0;
    let sum = 0;
    let sum2 = 0;
    for (let y = 0; y < h; y += step) {
      for (let x = 0; x < w; x += step) {
        const i = (y * w + x) * 4;
        const r = img[i] ?? 0;
        const g = img[i + 1] ?? 0;
        const b = img[i + 2] ?? 0;
        const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        sum += l;
        sum2 += l * l;
        if (l > 8) nonBlack += 1;
        n += 1;
      }
    }
    const mean = sum / Math.max(1, n);
    const varL = sum2 / Math.max(1, n) - mean * mean;
    const nonBlackRatio = nonBlack / Math.max(1, n);
    // Heuristic: not entirely black.
    // Variance can be low on very dark scenes; require some non-black pixels only.
    const ok = nonBlackRatio > 0.01;
    return { ok, w, h, mean: +mean.toFixed(2), varL: +varL.toFixed(2), nonBlackRatio: +nonBlackRatio.toFixed(4) };
  }, selector);
}

function writeLog(extra = "") {
  const body = [
    "# Wedding Simple E2E Test Session",
    "",
    `WEB_URL: ${WEB_URL}`,
    `API_URL: ${API_URL}`,
    "",
    "## Steps",
    "",
    ...logLines.map((l) => `- ${l}`),
    extra ? `\n${extra}` : "",
  ].join("\n");
  writeFileSync(logPath, body, "utf8");
}

mkdirSync(shotsDir, { recursive: true });

const result = {
  ok: false,
  error: null,
};

let browser;
let context;
let page;

try {
  await waitForApiReady(API_URL, API_READY_TIMEOUT_MS);
  log(`API OK ${API_URL}`);

  browser = await chromium.launch({
    headless: process.env.MBOX_HEADED === "1" ? false : true,
    args: ["--use-gl=angle", "--ignore-gpu-blocklist", "--enable-webgl", "--allow-file-access-from-files", "--disable-web-security"],
  });

  context = await browser.newContext({
    acceptDownloads: true,
    viewport: { width: 1440, height: 960 },
  });
  page = await context.newPage();

  // Log page errors or console logs for debugging
  page.on("console", (msg) => {
    log(`[BROWSER CONSOLE] [${msg.type()}] ${msg.text()}`);
  });
  const pageErrors = [];
  page.on("pageerror", (err) => {
    pageErrors.push(err.message);
    log(`[BROWSER ERROR] ${err.stack ?? err.message}`);
  });

  log(`Navigate to ${WEB_URL}`);
  await page.goto(WEB_URL, { waitUntil: "networkidle", timeout: 120_000 });
  await page.getByRole("heading", { name: "웨딩 사진 업로드" }).waitFor({ timeout: 30_000 });
  await shot(page, "01_loaded");

  // Check upload inputs
  const fileInput = page.locator('input[type="file"]');
  const sampleCandidates = [
    join(root, "wedding_2d_input.jpg"),
    join(root, ".cursor", "video-analysis", "cube_sample.jpg"),
    join(root, "data", "background", "1024_원본", "002.jpg"),
  ];
  const sampleImage = sampleCandidates.find((path) => existsSync(path));
  if (!sampleImage) {
    throw new Error(`No sample image found. Tried: ${sampleCandidates.join(", ")}`);
  }

  const imageCount = Math.min(
    20,
    Math.max(3, Number(process.env.MBOX_E2E_IMAGE_COUNT ?? 3))
  );
  log(`Uploading ${imageCount} files: ${sampleImage}`);
  await fileInput.setInputFiles(Array(imageCount).fill(sampleImage));
  await page.locator("#start-ai-btn").waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForTimeout(2000);
  await shot(page, "02_files_selected");

  // Click start AI button
  const startBtn = page.locator("#start-ai-btn");
  log("Clicking AI 원클릭 자동 보정 시작");
  await startBtn.click();
  await page.waitForTimeout(1000);
  await shot(page, "03_ai_running");

  // Wait for processing to finish (should transition to step 3)
  log("Waiting for AI processing completion...");
  await page.waitForFunction(
    () => Boolean(document.getElementById("step-3-view")),
    undefined,
    { timeout: 480_000 } // up to 8 minutes for 12 images
  );
  log("AI processing finished and stepped to 3D View successfully!");
  await shot(page, "04_step3_viewport");
  let canvasStats = null;
  for (let i = 0; i < 12; i += 1) {
    // Give the WebGL renderer a moment to draw the first frame(s).
    await page.waitForTimeout(750);
    canvasStats = await measureCanvasPaint(page, "canvas");
    log(`canvas paint: ${JSON.stringify(canvasStats)}`);
    if (canvasStats.ok) {
      break;
    }
  }
  if (!canvasStats?.ok) {
    throw new Error(`Canvas appears blank/unpainted: ${JSON.stringify(canvasStats)}`);
  }

  // Trigger MP4 export
  const exportBtn = page.locator("#export-btn");
  if (SKIP_MP4) {
    log("Skipping MP4 export (MBOX_SKIP_MP4=1)");
    result.ok = true;
    await shot(page, "05_step3_confirmed");
  } else {
    log("Clicking marriage.mp4 동영상 만들기");
    const downloadPromise = page.waitForEvent("download", { timeout: 120_000 });
    await exportBtn.click();
    await shot(page, "05_export_recording");

    // Wait for download to finish
    const download = await downloadPromise;
    const suggested = download.suggestedFilename();
    const downloadPath = join(sessionDir, suggested);
    await download.saveAs(downloadPath);

    const size = statSync(downloadPath).size;
    if (size < 1024) throw new Error(`Downloaded video too small: ${size} bytes`);
    log(`Download finished successfully: ${downloadPath} (${size} bytes)`);

    result.ok = true;
    result.downloadPath = downloadPath;
    result.downloadBytes = size;
    result.downloadFilename = suggested;

    await shot(page, "06_export_done");
  }
} catch (error) {
  result.ok = false;
  result.error = error instanceof Error ? error.message : String(error);
  log(`FAIL: ${result.error}`);
  if (page) {
    await shot(page, "99_error").catch(() => {});
  }
} finally {
  writeFileSync(resultPath, JSON.stringify(result, null, 2));
  writeLog(result.ok ? `\n## Success\nDownload: ${result.downloadPath}\n` : `\n## Error\n${result.error}\n`);
  
  if (page) await page.close().catch(() => {});
  if (context) await context.close().catch(() => {});
  if (browser) await browser.close().catch(() => {});
  
  log(`Wrote ${logPath}`);
  log(`Wrote ${resultPath}`);
}

process.exit(result.ok ? 0 : 1);
