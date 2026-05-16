/**
 * 20 Kakao JPGs (data/asset temp folder) → batch → 3D cube → optional MP4.
 *
 *   WEB_URL=http://127.0.0.1:5174 node scripts/e2e-kakao-20-asset.mjs
 *   MBOX_SKIP_MP4=1 node scripts/e2e-kakao-20-asset.mjs
 */
import { copyFileSync, existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const WEB_URL = process.env.WEB_URL ?? "http://127.0.0.1:5174";
const API_URL = process.env.API_URL ?? "http://127.0.0.1:8787";
const EXPECTED = 20;
const SKIP_BATCH = process.env.MBOX_SKIP_BATCH === "1";
const SKIP_MP4 = process.env.MBOX_SKIP_MP4 === "1";
const BATCH_TIMEOUT_MS = Number(process.env.BATCH_TIMEOUT_MS ?? 1_800_000);
/** Matches cubeSequence PHOTO_SEGMENT_MS × face count (+ small buffer). */
const PHOTO_SEGMENT_MS = 1_200 + 800 + 3_200 + 600;
const RECORD_MS = EXPECTED * PHOTO_SEGMENT_MS + 3_000;

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "experiments", "outputs");
const videoTmpDir = join(outDir, "video_tmp");
const resultPath = join(outDir, "data_asset_cube_20_result.json");
const deliverableVideo = join(outDir, "data_asset_cube_20.webm");

const log = (msg) => {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
};

const result = {
  webUrl: WEB_URL,
  expectedImageCount: EXPECTED,
  batchStatus: "pending",
  cubeStatus: "pending",
  videoStatus: SKIP_MP4 ? "skipped" : "pending",
};

const browser = await chromium.launch({
  headless: process.env.MBOX_HEADED !== "1",
  args: ["--use-gl=angle", "--ignore-gpu-blocklist", "--enable-webgl"],
});
mkdirSync(videoTmpDir, { recursive: true });
let context = await browser.newContext({
  acceptDownloads: true,
  viewport: { width: 1440, height: 960 },
  recordVideo: SKIP_MP4 ? undefined : { dir: videoTmpDir, size: { width: 1440, height: 960 } },
});
let page = await context.newPage();
let contextClosed = false;

try {
  const health = await fetch(`${API_URL}/health`);
  if (!health.ok) {
    throw new Error(`API not healthy at ${API_URL} (${health.status})`);
  }
  log(`api ok ${API_URL}`);

  log(`open ${WEB_URL}`);
  await page.goto(WEB_URL, { waitUntil: "domcontentloaded", timeout: 60_000 });

  if (!SKIP_BATCH) {
    const batchBtn = page.getByRole("button", { name: /data\/asset 배치 처리/ });
    if (!(await batchBtn.isVisible({ timeout: 10_000 }))) {
      throw new Error("data/asset 배치 버튼 없음 — VITE_ENABLE_DEV_ASSET_BATCH=true 로 웹을 띄우세요.");
    }

    log("click batch");
    await batchBtn.click();

    await page.waitForFunction(
      () => {
        const t = document.body.innerText;
        return t.includes("data/asset 배치 처리가 완료") && t.includes("20장");
      },
      undefined,
      { timeout: BATCH_TIMEOUT_MS },
    );
    result.batchStatus = "ok";
    log("batch done");
  } else {
    result.batchStatus = "skipped";
    log("skip batch (MBOX_SKIP_BATCH=1) — vault must already contain 20 images");
    await page.getByRole("button", { name: /후처리/ }).click();
    await page.getByText(/생성된 이미지 보관함/).waitFor({ timeout: 10_000 });
    const body = await page.locator("body").innerText();
    if (!body.match(/20\s*(items|장|개)/i) && !body.includes("20장")) {
      throw new Error("Expected 20 processed images in vault before skipping batch.");
    }
  }

  await page.getByRole("button", { name: /3D 큐브/ }).click();
  await page.getByText(`재생 ${EXPECTED}장`).waitFor({ timeout: 60_000 });
  await page.getByRole("button", { name: /연출 적용/ }).first().click();
  result.cubeStatus = "ok";
  log("cube ready");
  await page.screenshot({ path: join(outDir, "data_asset_cube_20.png"), fullPage: true });

  if (!SKIP_MP4) {
    log(`record viewport ${RECORD_MS}ms (Playwright recordVideo)`);
    await page.getByRole("button", { name: /연출 적용/ }).first().click();
    await page.waitForTimeout(RECORD_MS);
    const video = page.video();
    await page.close();
    page = null;
    await context.close();
    context = null;
    contextClosed = true;
    const recordedPath = video ? await video.path() : null;
    if (!recordedPath) {
      throw new Error("Playwright recordVideo path missing.");
    }
    copyFileSync(recordedPath, deliverableVideo);
    const size = statSync(deliverableVideo).size;
    if (size < 1024) throw new Error(`Video too small: ${size} bytes`);
    result.videoStatus = "ok";
    result.videoPath = deliverableVideo.replace(/\\/g, "/");
    result.videoBytes = size;
    log(`video saved ${deliverableVideo} (${size} bytes)`);
  }

  result.ok = true;
} catch (error) {
  result.ok = false;
  result.error = error instanceof Error ? error.message : String(error);
  log(`FAIL: ${result.error}`);
  if (page) {
    await page.screenshot({ path: join(outDir, "data_asset_e2e_fail.png"), fullPage: true }).catch(() => {});
  }
} finally {
  writeFileSync(resultPath, JSON.stringify(result, null, 2));
  if (page) {
    await page.close().catch(() => {});
  }
  if (context && !contextClosed) {
    await context.close();
  }
  await browser.close();
}

log(JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);
