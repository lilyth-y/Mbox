/**
 * Browser E2E: load app → (batch or vault) → 3D cube → MP4 download.
 * Records Playwright session video + step screenshots + process log.
 *
 *   node scripts/browser-download-cube-mp4.mjs
 *   MBOX_SAMPLE_COUNT=3 MBOX_SKIP_BATCH=0 node scripts/browser-download-cube-mp4.mjs
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "experiments", "outputs");
const sessionDir = join(outDir, "browser_download_session");
const profileDir = join(sessionDir, "playwright-profile");
const videoDir = join(sessionDir, "process_video");
const shotsDir = join(sessionDir, "screenshots");
const logPath = join(sessionDir, "process_log.md");
const resultPath = join(sessionDir, "download_result.json");

const WEB_URL = process.env.WEB_URL ?? "http://localhost:5173";
const API_URL = process.env.API_URL ?? "http://127.0.0.1:8787";
const SAMPLE_COUNT = Number(process.env.MBOX_SAMPLE_COUNT ?? "3");
/** Default: upload 3 local JPGs (fast). Set MBOX_USE_BATCH=1 for full data/asset batch. */
const USE_BATCH = process.env.MBOX_USE_BATCH === "1";
const SKIP_BATCH = !USE_BATCH;
const BATCH_TIMEOUT_MS = Number(process.env.BATCH_TIMEOUT_MS ?? 1_800_000);
const HEADED = process.env.MBOX_HEADED === "1";

const TRAVEL_IN_MS = 1500;
const TRAVEL_OUT_MS = 1200;
const ZOOM_MS = 850;
const PARALLAX_MS = 2700;
const LOOP_BRIDGE_MS = 900;

function estimateRecordMs(imageCount) {
  if (imageCount <= 0) return 15_000;
  let ms = TRAVEL_IN_MS + ZOOM_MS + PARALLAX_MS + TRAVEL_OUT_MS;
  for (let step = 1; step < imageCount; step += 1) {
    ms += ZOOM_MS + PARALLAX_MS + TRAVEL_OUT_MS;
  }
  if (imageCount >= 2) {
    ms -= TRAVEL_OUT_MS;
  }
  return ms + LOOP_BRIDGE_MS + 10_000;
}

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

function writeLog(extra = "") {
  const body = [
    "# Browser MP4 download session",
    "",
    `WEB_URL: ${WEB_URL}`,
    `API_URL: ${API_URL}`,
    `SAMPLE_COUNT: ${SAMPLE_COUNT}`,
    `SKIP_BATCH: ${SKIP_BATCH}`,
    "",
    "## Steps",
    "",
    ...logLines.map((l) => `- ${l}`),
    extra ? `\n${extra}` : "",
  ].join("\n");
  writeFileSync(logPath, body, "utf8");
}

mkdirSync(shotsDir, { recursive: true });
mkdirSync(videoDir, { recursive: true });

const result = {
  webUrl: WEB_URL,
  apiUrl: API_URL,
  sampleCount: SAMPLE_COUNT,
  ok: false,
};

let browser;
let context;
let page;

try {
  const health = await fetch(`${API_URL}/health`);
  if (!health.ok) throw new Error(`API unhealthy: ${API_URL} (${health.status})`);
  log(`API OK ${API_URL}`);

  browser = await chromium.launch({
    headless: !HEADED,
    args: ["--use-gl=angle", "--ignore-gpu-blocklist", "--enable-webgl"],
  });

  context = await browser.newContext({
    acceptDownloads: true,
    viewport: { width: 1440, height: 960 },
    recordVideo: { dir: videoDir, size: { width: 1440, height: 960 } },
  });
  page = await context.newPage();

  log(`Navigate ${WEB_URL}`);
  await page.goto(WEB_URL, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await shot(page, "01_app_loaded");

  let imageCount = 0;

  if (!SKIP_BATCH) {
    await page.evaluate((limit) => {
      sessionStorage.setItem("mbox_batch_limit", String(limit));
    }, SAMPLE_COUNT);
    const batchBtn = page.getByRole("button", { name: /data\/asset 배치 처리/ });
    if (!(await batchBtn.isVisible({ timeout: 15_000 }).catch(() => false))) {
      throw new Error("배치 버튼 없음 — VITE_LOCALHOST_DEMO=true 로 웹 dev 서버 실행 필요");
    }
    log(`Click data/asset batch (wait up to ${BATCH_TIMEOUT_MS}ms)`);
    await batchBtn.click();
    await shot(page, "02_batch_running");

    await page.waitForFunction(
      (expected) => {
        const t = document.body.innerText;
        return t.includes("data/asset 배치 처리가 완료") && t.includes(`${expected}장`);
      },
      SAMPLE_COUNT,
      { timeout: BATCH_TIMEOUT_MS }
    );
    imageCount = SAMPLE_COUNT;
    result.batchStatus = "ok";
    log(`Batch done (${imageCount} images)`);
    await shot(page, "03_batch_done");
  } else {
    result.batchStatus = "skipped";
    log("Skip batch — upload subset via file input");
    const assetDir = join(root, "data", "asset", "temp_1778692001076.-1818431043");
    const jpgs = readdirSync(assetDir)
      .filter((f) => /^KakaoTalk_.*\.jpg$/i.test(f))
      .sort()
      .slice(0, SAMPLE_COUNT)
      .map((f) => join(assetDir, f));
    if (jpgs.length < SAMPLE_COUNT) {
      throw new Error(`Need ${SAMPLE_COUNT} JPGs in ${assetDir}, found ${jpgs.length}`);
    }
    await page.locator('input[type="file"]').setInputFiles(jpgs);
    log(`Uploaded ${jpgs.length} files: ${jpgs.map((p) => p.split(/[/\\]/).pop()).join(", ")}`);
    await shot(page, "02_files_selected");
    await page.getByRole("button", { name: /분석·크롭 시작/ }).click();
    await page.waitForFunction(
      () => {
        const t = document.body.innerText;
        return /처리 완료|보관함|생성된 이미지/.test(t) && !t.includes("분석 중");
      },
      undefined,
      { timeout: BATCH_TIMEOUT_MS }
    );
    imageCount = SAMPLE_COUNT;
    log("Analyze/crop finished");
    await shot(page, "03_process_done");
  }

  log("Open 3D cube tab");
  await page.getByRole("button", { name: /3D 큐브/ }).click();
  await page.getByText(new RegExp(`재생 ${imageCount}장`)).waitFor({ timeout: 60_000 });
  await shot(page, "04_cube_tab");

  await page.getByRole("button", { name: /연출 적용/ }).first().click();
  log("Presentation reset (연출 적용)");
  await page.waitForTimeout(1500);
  await shot(page, "05_presentation_ready");

  const recordMs = estimateRecordMs(imageCount);
  result.estimatedRecordMs = recordMs;
  log(`Click MP4 생성 (expect ~${Math.round(recordMs / 1000)}s recording)`);

  const downloadPromise = page.waitForEvent("download", { timeout: recordMs + 120_000 });
  await page.getByRole("button", { name: /^MP4 생성$/ }).first().click();
  await shot(page, "06_mp4_recording");

  await page
    .getByText(/MP4 생성 파일이 준비|WebM으로 저장|영상 저장에 실패/)
    .waitFor({ timeout: recordMs + 120_000 });

  const download = await downloadPromise;
  const suggested = download.suggestedFilename();
  const downloadPath = join(sessionDir, suggested);
  await download.saveAs(downloadPath);
  const size = statSync(downloadPath).size;
  if (size < 1024) throw new Error(`Download too small: ${size} bytes`);

  result.downloadPath = downloadPath.replace(/\\/g, "/");
  result.downloadBytes = size;
  result.downloadFilename = suggested;

  const head = readFileSync(downloadPath).subarray(4, 8).toString("ascii");
  result.containerMagic = head;
  result.validIsoMp4 = head === "ftyp";
  if (suggested.endsWith(".mp4") && head !== "ftyp") {
    throw new Error(`Download is not ISO MP4 (magic=${head}); likely WebM or truncated.`);
  }

  log(`Download saved: ${downloadPath} (${size} bytes, magic=${head})`);
  await shot(page, "07_mp4_done");

  const bodyText = await page.locator("body").innerText();
  result.recordingMessage = bodyText.includes("WebM") ? "webm_fallback" : "mp4_ok";

  result.ok = true;
  result.cubeStatus = "ok";
  result.videoStatus = "ok";
} catch (error) {
  result.ok = false;
  result.error = error instanceof Error ? error.message : String(error);
  log(`FAIL: ${result.error}`);
  if (page) {
    await shot(page, "99_error").catch(() => {});
  }
} finally {
  writeFileSync(resultPath, JSON.stringify(result, null, 2));

  let processVideoPath = null;
  if (page?.video()) {
    const vpath = await page.video().path();
    processVideoPath = join(sessionDir, "browser_process.webm");
    try {
      copyFileSync(vpath, processVideoPath);
      result.processVideoPath = processVideoPath.replace(/\\/g, "/");
      log(`Process recording: ${processVideoPath}`);
    } catch {
      result.processVideoPath = vpath;
    }
  }

  writeLog(
    result.ok
      ? `\n## Outputs\n\n- Download: \`${result.downloadPath}\`\n- Process video: \`${result.processVideoPath ?? "n/a"}\`\n- Screenshots: \`${shotsDir.replace(/\\/g, "/")}/\`\n`
      : `\n## Error\n\n${result.error}\n`
  );

  if (page) await page.close().catch(() => {});
  if (context) await context.close().catch(() => {});
  if (browser) await browser.close().catch(() => {});

  log(`Wrote ${logPath}`);
  log(`Wrote ${resultPath}`);
}

console.log(JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);
