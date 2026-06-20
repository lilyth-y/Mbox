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
import { waitForApiReady } from "./lib/wait-for-api.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "experiments", "outputs", "cube_frame_verify");
const shotsDir = join(outDir, "frames");
const resultPath = join(outDir, "verify_result.json");

const WEB_URL = process.env.WEB_URL ?? "http://localhost:5173";
const API_URL = process.env.API_URL ?? "http://127.0.0.1:8787";
const SAMPLE_COUNT = Number(process.env.MBOX_SAMPLE_COUNT ?? "6");
const SKIP_MP4 = process.env.SKIP_MP4 === "1";
const API_READY_TIMEOUT_MS = Number(process.env.API_READY_TIMEOUT_MS ?? 120_000);
const FRAME_LABELS = ["로즈골드", "펄 화이트", "클래식 블랙", "세이지 가든", "로열 네이비"];
// NOTE: cube_focus ("1. 정육면체") is the default effect and is NOT shown in the beta template list.
// We verify cube_focus implicitly (first canvas paint check + MP4), and verify 2..5 via beta buttons.
const BETA_EFFECT_LABELS = ["2. 책 펼침", "3. 원판 회전", "4. 궤도 갤러리", "5. 앨범 넘김", "6. 3D 슬라이드쇼"];

mkdirSync(shotsDir, { recursive: true });

const result = {
  webUrl: WEB_URL,
  apiUrl: API_URL,
  ok: false,
  frames: [],
  mp4: null,
  effects: [],
};

const errors = [];

function slug(label) {
  return label.replace(/\s+/g, "_");
}

async function main() {
  await waitForApiReady(API_URL, API_READY_TIMEOUT_MS);

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
  page.on("pageerror", (e) => errors.push(String(e)));

  const measureCanvasPaint = async () => {
    return await page.evaluate(() => {
      const canvas = document.querySelector("canvas");
      if (!(canvas instanceof HTMLCanvasElement)) {
        return { ok: false, reason: "missing canvas" };
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
      const ok = nonBlackRatio > 0.01;
      return { ok, w, h, mean: +mean.toFixed(2), varL: +varL.toFixed(2), nonBlackRatio: +nonBlackRatio.toFixed(4) };
    });
  };

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

    // Enable hologram fan preview mode (1:1 + particles) to match operator usage.
    const holoToggle = page.getByRole("checkbox", { name: /3D 홀로그램 팬 모드/ });
    await holoToggle.waitFor({ state: "visible", timeout: 15_000 });
    if (!(await holoToggle.isChecked().catch(() => false))) {
      await holoToggle.check();
      await page.waitForTimeout(750);
    }

    // Ensure a visible particle theme (matches hologram fan operator expectations).
    const goldDust = page.getByRole("button", { name: /금가루|Gold/ }).first();
    await goldDust.waitFor({ state: "visible", timeout: 15_000 });
    await goldDust.click();
    await page.waitForTimeout(750);

    // VoluMax mood FX (depth rings — keep photos visible; no cs5 overlay stack for MP4).
    const voluMaxToggle = page.getByRole("checkbox", { name: /VoluMax 무드 FX/ });
    if (await voluMaxToggle.count().catch(() => 0)) {
      await voluMaxToggle.first().check().catch(() => {});
      await page.getByRole("button", { name: /^Medium$/ }).first().click().catch(() => {});
      await page.waitForTimeout(750);
    }

    await page.getByRole("button", { name: /연출 적용/ }).first().click();
    const canvas = page.locator("canvas").first();
    await canvas.waitFor({ state: "visible", timeout: 30_000 });
    // Wait for auto background-plate prep (VoluMax dual-layer) when entering cube tab.
    await page
      .getByText(/배경 플레이트가 준비|플레이트 준비|연출용 배경 플레이트/)
      .first()
      .waitFor({ timeout: 120_000 })
      .catch(() => {});
    await page.waitForTimeout(3_000);
    const paint = await measureCanvasPaint();
    if (!paint.ok) {
      throw new Error(`Canvas appears blank/unpainted: ${JSON.stringify(paint)}`);
    }

    await page.screenshot({ path: join(outDir, "00_cube_tab.png"), fullPage: true });

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

    // Optional cs5 stack for screenshot/effect regression only (not baked into MP4 above).
    if (process.env.MBOX_VERIFY_CS5 === "1") {
      for (const label of [
        /Box Logo — Lens/,
        /VoluMax — Flare/,
        /VoluMax — Clouds/,
        /VoluMax — Dirt/,
        /VoluMax — Dust/,
        /Confetti Pack/,
      ]) {
        const toggle = page.getByRole("checkbox", { name: label });
        if (await toggle.count().catch(() => 0)) {
          await toggle.first().check().catch(() => {});
        }
      }
      await page.waitForTimeout(500);
      await page.getByRole("button", { name: /연출 적용/ }).first().click();
      await page.waitForTimeout(2_000);
    }

    // Frame presets on cube_focus (before switching to beta templates).
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

    // Ensure all effect buttons are visible (some are behind "베타 템플릿" toggle).
    const showBeta = page.getByRole("button", { name: /베타 템플릿 숨기기|다른 연출 템플릿/ }).first();
    if (await showBeta.isVisible().catch(() => false)) {
      await showBeta.click().catch(() => {});
      await page.waitForTimeout(750);
    }

    // Verify all built-in effects render (non-blank canvas).
    for (const effectLabel of BETA_EFFECT_LABELS) {
      const btn = page.getByRole("button", { name: new RegExp(effectLabel) }).first();
      await btn.waitFor({ state: "visible", timeout: 15_000 });
      await btn.click();
      await page.waitForTimeout(750);
      await page.getByRole("button", { name: /연출 적용/ }).first().click();
      await page.waitForTimeout(2_500);
      const p = await measureCanvasPaint();
      const ok = Boolean(p.ok);
      result.effects.push({ effectLabel, ok, paint: p });
      if (!ok) {
        throw new Error(`Effect render blank: ${effectLabel} ${JSON.stringify(p)}`);
      }
    }

    result.ok =
      result.frames.length === FRAME_LABELS.length &&
      result.frames.every((f) => f.ok) &&
      result.effects.length === BETA_EFFECT_LABELS.length &&
      result.effects.every((e) => e.ok) &&
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
  result.errors = errors.slice(0, 8);
  writeFileSync(resultPath, JSON.stringify(result, null, 2));
  console.error("Page errors during run:", errors);
  console.error(result.error);
  process.exit(1);
});
