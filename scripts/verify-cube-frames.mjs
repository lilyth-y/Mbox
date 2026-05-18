#!/usr/bin/env node
/**
 * E2E: upload samples → 3D cube → screenshot each of 5 frame presets → optional MP4.
 *
 *   node scripts/verify-cube-frames.mjs
 *   WEB_URL=http://localhost:5173 node scripts/verify-cube-frames.mjs
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "experiments", "outputs", "cube_frame_verify");
const shotsDir = join(outDir, "frames");
const resultPath = join(outDir, "verify_result.json");

const WEB_URL = process.env.WEB_URL ?? "http://localhost:5173";
const API_URL = process.env.API_URL ?? "http://127.0.0.1:8787";
const SAMPLE_COUNT = Number(process.env.MBOX_SAMPLE_COUNT ?? "2");
const SKIP_MP4 = process.env.SKIP_MP4 === "1";
const FRAME_LABELS = ["로즈골드", "펄 화이트", "클래식 블랙", "세이지 가든", "로열 네이비"];

mkdirSync(shotsDir, { recursive: true });

const result = {
  webUrl: WEB_URL,
  apiUrl: API_URL,
  ok: false,
  frames: [],
  mp4: null,
};

function slug(label) {
  return label.replace(/\s+/g, "_");
}

async function main() {
  const health = await fetch(`${API_URL}/health`);
  if (!health.ok) {
    throw new Error(`API not ready: ${API_URL} (${health.status})`);
  }

  const assetDir = join(root, "data", "asset", "temp_1778692001076.-1818431043");
  const jpgs = readdirSync(assetDir)
    .filter((f) => /^KakaoTalk_.*\.jpg$/i.test(f))
    .sort()
    .slice(0, SAMPLE_COUNT)
    .map((f) => join(assetDir, f));
  if (jpgs.length < SAMPLE_COUNT) {
    throw new Error(`Need ${SAMPLE_COUNT} JPGs in ${assetDir}`);
  }

  const browser = await chromium.launch({
    headless: true,
    args: ["--use-gl=angle", "--ignore-gpu-blocklist", "--enable-webgl"],
  });
  const context = await browser.newContext({
    acceptDownloads: true,
    viewport: { width: 1440, height: 960 },
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  try {
    await page.goto(WEB_URL, { waitUntil: "domcontentloaded", timeout: 120_000 });

    await page.locator('input[type="file"]').setInputFiles(jpgs);
    await page.getByRole("button", { name: /분석·크롭 시작/ }).click();
    await page.waitForFunction(
      () => /처리 완료|보관함/.test(document.body.innerText) && !document.body.innerText.includes("분석 중"),
      undefined,
      { timeout: 600_000 }
    );

    await page.getByRole("button", { name: /3D 큐브/ }).click();
    await page.getByText(new RegExp(`재생 ${SAMPLE_COUNT}장`)).waitFor({ timeout: 60_000 });
    await page.getByRole("button", { name: /연출 적용/ }).first().click();
    const canvas = page.locator("canvas").first();
    await canvas.waitFor({ state: "visible", timeout: 30_000 });
    await page.waitForTimeout(6_000);

    await page.screenshot({ path: join(outDir, "00_cube_tab.png"), fullPage: true });

    for (const label of FRAME_LABELS) {
      const btn = page.getByRole("button", { name: new RegExp(label) }).first();
      await btn.waitFor({ state: "visible", timeout: 15_000 });
      await btn.click();
      await page.waitForTimeout(1_500);
      await page.getByRole("button", { name: /연출 적용/ }).first().click();
      await page.waitForTimeout(5_000);

      const shotPath = join(shotsDir, `frame_${slug(label)}.png`);
      await canvas.screenshot({ path: shotPath });
      result.frames.push({ label, screenshot: shotPath.replace(/\\/g, "/"), ok: existsSync(shotPath) });
      console.log(`[frame] ${label} → ${shotPath}`);
    }

    if (!SKIP_MP4) {
      const bgmCheckbox = page.getByRole("checkbox", { name: /배경음악 포함/ });
      if (await bgmCheckbox.isChecked().catch(() => false)) {
        await bgmCheckbox.uncheck();
      }
      const recordMs = 55_000;
      const downloadPromise = page.waitForEvent("download", { timeout: recordMs + 120_000 });
      await page.getByRole("button", { name: /^MP4 생성$/ }).first().click();
      await page
        .getByText(/MP4 생성 파일|BGM이 합성|WebM으로 저장|영상 저장에 실패/)
        .waitFor({ timeout: recordMs + 90_000 });

      let mp4Ok = false;
      let mp4Error = null;
      try {
        const download = await downloadPromise;
        const mp4Path = join(outDir, download.suggestedFilename());
        await download.saveAs(mp4Path);
        const head = readFileSync(mp4Path).subarray(4, 8).toString("ascii");
        mp4Ok = statSync(mp4Path).size > 1024 && head === "ftyp";
        result.mp4 = {
          path: mp4Path.replace(/\\/g, "/"),
          bytes: statSync(mp4Path).size,
          ftyp: head === "ftyp",
          ok: mp4Ok,
        };
        console.log(`[mp4] ${mp4Path} (${statSync(mp4Path).size} bytes, magic=${head})`);
      } catch (error) {
        mp4Error = error instanceof Error ? error.message : String(error);
        result.mp4 = { ok: false, error: mp4Error };
      }
    }

    result.ok =
      result.frames.length === FRAME_LABELS.length &&
      result.frames.every((f) => f.ok) &&
      (SKIP_MP4 || result.mp4?.ok === true);
    result.errors = errors.slice(0, 8);
  } finally {
    writeFileSync(resultPath, JSON.stringify(result, null, 2));
    await browser.close();
  }

  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

main().catch((error) => {
  result.ok = false;
  result.error = error instanceof Error ? error.message : String(error);
  writeFileSync(resultPath, JSON.stringify(result, null, 2));
  console.error(result.error);
  process.exit(1);
});
