/**
 * Browser E2E: hosted mbox — upload → cube MP4 export pipeline.
 * Usage (from repo root, playwright installed):
 *   node scripts/e2e-hosted-pipeline.mjs
 *
 * Timeouts (defaults): MBOX_ANALYZE_TIMEOUT_MS=480000, MBOX_RECORD_TIMEOUT_MS=180000
 */
import { existsSync, mkdtempSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { loadEnvLocal } from "./lib/load-env-local.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
loadEnvLocal(root);

const WEB_URL =
  process.env.MBOX_WEB_URL ??
  "https://mbox-web-newmedia-496107.storage.googleapis.com/index.html";
const testImage =
  process.env.MBOX_TEST_IMAGE ??
  join(root, "experiments/assets/web-varied/web-portrait-tall.jpg");

if (!existsSync(testImage)) {
  console.error("Missing test image:", testImage);
  process.exit(1);
}

/** Hosted bg-removal + analyze often exceeds 3 min for 3 images on Cloud Run. */
const ANALYZE_TIMEOUT_MS = Number(process.env.MBOX_ANALYZE_TIMEOUT_MS ?? 480_000);
/** Fan timeline ~6s/step + encoder flush; allow headless BGM + MediaRecorder slack. */
const RECORD_TIMEOUT_MS = Number(
  process.env.MBOX_RECORD_TIMEOUT_MS ?? Math.max(240_000, 60_000 + 6_000 * 3 + 900 + 5_000),
);
const SKIP_MP4 = process.env.MBOX_SKIP_MP4 === "1";

const browser = await chromium.launch({
  headless: process.env.MBOX_HEADED !== "1",
  args: ["--use-gl=angle", "--ignore-gpu-blocklist", "--enable-webgl"],
});
const context = await browser.newContext({ acceptDownloads: true });
await context.addInitScript(() => {
  window.__MBOX_E2E_EXPORT__ = true;
});
const page = await context.newPage();

const consoleErrors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});
page.on("pageerror", (err) => consoleErrors.push(String(err)));

const fail = (message) => {
  throw new Error(message);
};

async function runHostedFlow() {
  await page.locator('input[type="file"]').setInputFiles(testImage);
  await page.getByRole("button", { name: /분석·크롭 시작/ }).click();

  await page.waitForFunction(
    () => document.body.innerText.includes("분석·크롭이 완료"),
    undefined,
    { timeout: ANALYZE_TIMEOUT_MS },
  );

  await page.getByRole("button", { name: /3D 큐브/ }).click();
  await page.getByText("3D VISUALIZATION").waitFor({ timeout: 30_000 });
  await page.getByRole("button", { name: /연출 적용/ }).first().click();

  const mp4Button = page.getByRole("button", { name: /MP4 생성/ }).first();
  await mp4Button.waitFor({ state: "visible", timeout: 15_000 });
  if (await mp4Button.isDisabled()) {
    fail("MP4 생성 button disabled — no processed images in cube view");
  }

  let suggested = null;
  let size = 0;
  if (!SKIP_MP4) {
    const downloadPromise = page.waitForEvent("download", { timeout: RECORD_TIMEOUT_MS });
    await mp4Button.click();
    await page
      .getByText(/MP4 생성 파일이 준비|WebM으로 저장|영상 저장에 실패/i)
      .first()
      .waitFor({ timeout: RECORD_TIMEOUT_MS });
    const download = await downloadPromise;
    suggested = download.suggestedFilename();
    const outDir = mkdtempSync(join(tmpdir(), "mbox-e2e-"));
    const outPath = join(outDir, suggested);
    await download.saveAs(outPath);
    size = statSync(outPath).size;

    if (!/\.(webm|mp4)$/i.test(suggested)) {
      fail(`Unexpected download filename: ${suggested}`);
    }
    if (size < 1024) {
      fail(`Download too small (${size} bytes): ${suggested}`);
    }
  }

  return { suggested, size };
}

try {
  const response = await page.goto(WEB_URL, { waitUntil: "domcontentloaded", timeout: 60_000 });
  if (!response?.ok()) fail(`Web load failed: ${response?.status()}`);

  const bodyText = await page.locator("body").innerText();
  if (/localhost\s*demo/i.test(bodyText)) {
    fail('Page still shows "Localhost Demo" badge');
  }
  if (/data\/asset\s*배치/i.test(bodyText)) {
    fail("Dev asset batch button visible in production UI");
  }
  if (/웨딩 홀로그램 오퍼레이터/i.test(bodyText)) {
    fail("Wedding hologram operator UI should not appear in main mbox app");
  }

  const result = await runHostedFlow();

  const blocking = consoleErrors.filter((line) =>
    /cors|failed to fetch|invalid api key|401|403/i.test(line),
  );
  if (blocking.length > 0) {
    fail(`Console errors:\n${blocking.join("\n")}`);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        mode: "classic",
        webUrl: WEB_URL,
        testImage,
        skipMp4: SKIP_MP4,
        downloadFile: result.suggested,
        downloadBytes: result.size,
        consoleErrorCount: consoleErrors.length,
      },
      null,
      2,
    ),
  );
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
  if (consoleErrors.length) console.error("Console:", consoleErrors.slice(0, 8));
} finally {
  await browser.close();
}

if (process.exitCode) process.exit(process.exitCode);
