#!/usr/bin/env node
/**
 * 앱 내장 MP4 생성 버튼을 이용한 Z-Push 효과 영상 캡처
 * - Processing 탭에서 배경제거(누끼) 완료까지 대기
 * - 3D 큐브 연출 적용 후 MP4 생성 버튼 클릭 → 파일 다운로드
 */
import { existsSync, mkdirSync, readdirSync, statSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "experiments", "outputs", "focus_pulse_mp4");
mkdirSync(outDir, { recursive: true });

const WEB_URL = process.env.WEB_URL ?? "http://localhost:5173";
const API_URL = process.env.API_URL ?? "http://127.0.0.1:8787";
const SAMPLE_COUNT = Number(process.env.MBOX_SAMPLE_COUNT ?? "4");

const assetDir = join(root, "data", "asset", "temp_1778692001076.-1818431043");
const jpgs = readdirSync(assetDir)
  .filter((f) => /^KakaoTalk_.*\.jpg$/i.test(f))
  .sort()
  .slice(0, SAMPLE_COUNT)
  .map((f) => join(assetDir, f));

if (jpgs.length < SAMPLE_COUNT) {
  console.error(`샘플 이미지 부족: ${jpgs.length}장`);
  process.exit(1);
}

// API 준비 확인
const health = await fetch(`${API_URL}/health`);
if (!health.ok) {
  console.error(`API 준비 안 됨: ${API_URL} (${health.status})`);
  process.exit(1);
}

const browser = await chromium.launch({
  headless: false,
  args: [
    "--use-gl=angle",
    "--ignore-gpu-blocklist",
    "--enable-webgl",
    "--disable-gpu-sandbox",
    "--enable-accelerated-2d-canvas",
  ],
});

const context = await browser.newContext({
  acceptDownloads: true,
  viewport: { width: 1440, height: 900 },
});

const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

try {
  console.log("1. 앱 로딩...");
  await page.goto(WEB_URL, { waitUntil: "domcontentloaded", timeout: 60_000 });

  console.log("2. Processing 탭 이동...");
  await page.getByRole("button", { name: "프로세싱" }).click();

  console.log(`3. ${SAMPLE_COUNT}장 이미지 업로드...`);
  await page.locator('input[type="file"]').setInputFiles(jpgs);
  await page.getByRole("button", { name: /분석·크롭 시작/ }).click();

  console.log("4. AI 분석 + 누끼 제거 대기 (최대 10분)...");
  await page.waitForFunction(
    () => {
      const text = document.body.innerText;
      return /처리 완료|보관함/.test(text) && !text.includes("분석 중");
    },
    undefined,
    { timeout: 600_000 }
  );
  console.log("   ✓ 분석 완료");

  console.log("5. 3D 큐브 탭으로 이동...");
  await page.getByRole("button", { name: /3D 큐브/ }).click();
  await page.waitForTimeout(2_000);

  console.log("6. 연출 적용...");
  await page.getByRole("button", { name: /연출 적용/ }).first().click();

  const canvas = page.locator("canvas").first();
  await canvas.waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForTimeout(3_000); // 첫 프레임 안정화

  // 스크린샷: 줌인 직전 (회전 단계)
  await canvas.screenshot({ path: join(outDir, "01_rotation_phase.png") });
  console.log("   ✓ 스크린샷 1: 회전 단계");

  await page.waitForTimeout(3_000);
  // 스크린샷: 줌인 완료 ~ parallax (Z-Push 피크 구간)
  await canvas.screenshot({ path: join(outDir, "02_focus_peak.png") });
  console.log("   ✓ 스크린샷 2: 포커스 피크 (Z-Push 활성)");

  await page.waitForTimeout(3_000);
  await canvas.screenshot({ path: join(outDir, "03_parallax_hold.png") });
  console.log("   ✓ 스크린샷 3: Parallax 홀드");

  console.log("7. MP4 생성 시작...");
  const bgmCheckbox = page.getByRole("checkbox", { name: /배경음악 포함/ });
  if (await bgmCheckbox.isChecked().catch(() => false)) {
    await bgmCheckbox.uncheck();
  }

  const recordMs = 50_000; // ~21초 영상 기록에 여유
  const downloadPromise = page.waitForEvent("download", { timeout: recordMs + 120_000 });
  await page.getByRole("button", { name: /^MP4 생성$/ }).first().click();

  console.log(`   MP4 녹화 중 (~${recordMs / 1000}초 대기)...`);
  await page
    .getByText(/MP4 생성 파일|BGM이 합성|WebM으로 저장|영상 저장에 실패/)
    .waitFor({ timeout: recordMs + 90_000 });

  const download = await downloadPromise;
  const mp4Path = join(outDir, "focus_pulse_effect.mp4");
  await download.saveAs(mp4Path);

  const stat = statSync(mp4Path);
  const magic = readFileSync(mp4Path).subarray(4, 8).toString("ascii");
  console.log(`\n✅ MP4 저장 완료!`);
  console.log(`📁 ${mp4Path}`);
  console.log(`📦 크기: ${(stat.size / 1024 / 1024).toFixed(1)} MB`);
  console.log(`🔍 매직: ${magic} (${magic === "ftyp" ? "✓ 유효한 MP4" : "⚠ 비정상"})`);

  if (errors.length > 0) {
    console.log("\n⚠ 콘솔 에러:");
    errors.slice(0, 5).forEach(e => console.log(" -", e));
  }
} finally {
  await context.close();
  await browser.close();
}
