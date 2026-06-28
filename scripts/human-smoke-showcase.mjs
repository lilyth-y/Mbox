#!/usr/bin/env node
/**
 * Human-eye smoke — real Kakao JPGs, heart + cube, pull-hold screenshots.
 *
 *   npm run human-smoke:showcase
 *   MBOX_HUMAN_SMOKE_SHAPES=heart npm run human-smoke:showcase
 *
 * Output: experiments/outputs/human-smoke/<stamp>/
 *   heart/01_upload_ready.png … 03_pull_hold_canvas.png
 *   cube/…
 *   manifest.json + CHECKLIST.md (human review)
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { WEB_URL } from "./lib/dev-ports.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const assetDir = join(root, "data", "asset", "temp_1778692001076.-1818431043");
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const outRoot = join(root, "experiments", "outputs", "human-smoke", stamp);

const photoCount = Number(process.env.MBOX_HUMAN_SMOKE_PHOTOS ?? 6);
const shapes = (process.env.MBOX_HUMAN_SMOKE_SHAPES ?? "heart,cube")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const look = process.env.MBOX_HUMAN_SMOKE_LOOK ?? "rose_gold_premium";
const bg = process.env.MBOX_HUMAN_SMOKE_BG ?? "solid_black";

const useSwiftShader =
  process.env.MBOX_USE_SWIFTSHADER !== "0" && process.env.MBOX_USE_SWIFTSHADER !== "false";

function listRealPhotos() {
  if (!existsSync(assetDir)) {
    throw new Error(`Missing Kakao asset dir: ${assetDir}`);
  }
  const files = readdirSync(assetDir)
    .filter((f) => /^KakaoTalk_.*\.jpg$/i.test(f))
    .sort()
    .slice(0, photoCount)
    .map((f) => join(assetDir, f));
  if (files.length < photoCount) {
    throw new Error(`Need ${photoCount} Kakao JPGs, found ${files.length}`);
  }
  return files;
}

function buildUrl(shapeId) {
  const url = new URL(`${WEB_URL}/showcase.html`);
  url.searchParams.set("localOnly", "1");
  url.searchParams.set("fullGpu", "1");
  url.searchParams.set("noPhysics", "1");
  url.searchParams.set("shape", shapeId);
  url.searchParams.set("look", look);
  url.searchParams.set("bg", bg);
  url.searchParams.delete("backdrop");
  return url.toString();
}

async function waitForDevServer() {
  const probe = `${WEB_URL}/showcase.html`;
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

async function captureShape(browser, shapeId, photos, manifest) {
  const shapeDir = join(outRoot, shapeId);
  mkdirSync(shapeDir, { recursive: true });

  const context = await browser.newContext({
    viewport: { width: 1080, height: 1080 },
    deviceScaleFactor: 1,
  });
  await context.addInitScript(() => {
    window.__MBOX_SHOWCASE_E2E__ = true;
    window.__MBOX_SHOWCASE_AUTOMATION__ = true;
  });

  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  const url = buildUrl(shapeId);
  console.log(`\n=== ${shapeId} ===`);
  console.log(url);

  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });

  const upload = page.locator('[data-testid="showcase-photo-upload"]');
  await upload.waitFor({ state: "attached", timeout: 30_000 });
  await upload.setInputFiles(photos);

  await page.waitForFunction(
    () => typeof window.__MBOX_SHOWCASE_UPLOAD_AUDIT__ === "function",
    undefined,
    { timeout: 120_000 }
  );
  await page.waitForFunction(
    () => window.__MBOX_SHOWCASE_UPLOAD_AUDIT__?.()?.pass === true,
    undefined,
    { timeout: 120_000, polling: 400 }
  );

  await page.waitForTimeout(800);
  await page.screenshot({ path: join(shapeDir, "01_viewport_upload_ready.png"), fullPage: true });

  const canvas = page.locator(".showcase-viewport-wrap canvas").first();
  await canvas.waitFor({ state: "visible", timeout: 60_000 });
  await canvas.screenshot({ path: join(shapeDir, "02_canvas_upload_ready.png") });

  await page.waitForFunction(
    () => typeof window.__MBOX_SHOWCASE_SHAPE_AUDIT__ === "function",
    undefined,
    { timeout: 120_000 }
  );

  const timeoutMs = Number(process.env.MBOX_SHAPE_LIVE_TIMEOUT_MS ?? 180_000);
  const frozen = await page.waitForFunction(
    () => {
      const auditFn = window.__MBOX_SHOWCASE_SHAPE_AUDIT__;
      if (!auditFn) return false;
      const result = auditFn();
      const inPullHold = result?.checks?.some(
        (c) => c.id === "live:pull_hold_phase" && c.pass
      );
      if (inPullHold) {
        window.__MBOX_SHOWCASE_RIG_DEBUG__?.();
        return { ok: true, audit: result };
      }
      return false;
    },
    undefined,
    { timeout: timeoutMs, polling: 200 }
  );

  const pullAudit = await frozen.jsonValue();
  await canvas.screenshot({ path: join(shapeDir, "03_canvas_pull_hold.png") });
  await page.screenshot({ path: join(shapeDir, "04_viewport_pull_hold.png"), fullPage: true });

  const audit = pullAudit?.audit ?? (await page.evaluate(() => window.__MBOX_SHOWCASE_SHAPE_AUDIT__?.()));
  const uploadAudit = await page.evaluate(() => window.__MBOX_SHOWCASE_UPLOAD_AUDIT__?.());
  const pullHeroDebug = await page.evaluate(() => {
    const auditFn = window.__MBOX_SHOWCASE_SHAPE_AUDIT__;
    const rigFn = window.__MBOX_SHOWCASE_RIG_DEBUG__;
    const dup = auditFn?.().checks?.find((c) => c.id === "live:photo_duplicate_face");
    return {
      duplicateFace: dup?.detail ?? null,
      rig: rigFn?.() ?? null,
    };
  });

  const entry = {
    shapeId,
    url,
    photos: photos.map((p) => p.split(/[/\\]/).pop()),
    look,
    background: bg,
    uploadAuditPass: uploadAudit?.pass === true,
    shapeAuditPass: audit?.passed === true,
    failedChecks: audit?.checks?.filter((c) => !c.pass).map((c) => c.id) ?? [],
    pullHeroDetail: pullHeroDebug,
    canvasMetrics: audit?.canvas ?? null,
    snapshot: audit?.snapshot
      ? {
          stageId: audit.snapshot.stageId,
          phaseElapsedMs: audit.snapshot.phaseElapsedMs,
          imageIndex: audit.snapshot.imageIndex,
        }
      : null,
    screenshots: {
      viewportUpload: `human-smoke/${stamp}/${shapeId}/01_viewport_upload_ready.png`,
      canvasUpload: `human-smoke/${stamp}/${shapeId}/02_canvas_upload_ready.png`,
      canvasPullHold: `human-smoke/${stamp}/${shapeId}/03_canvas_pull_hold.png`,
      viewportPullHold: `human-smoke/${stamp}/${shapeId}/04_viewport_pull_hold.png`,
    },
    consoleErrors: consoleErrors.slice(0, 12),
    humanReview: {
      photoNatural: null,
      framingOk: null,
      motionPleasant: null,
      sellable: null,
      notes: "",
    },
  };

  manifest.shapes.push(entry);
  console.log(
    `${shapeId}: upload=${entry.uploadAuditPass} shape=${entry.shapeAuditPass}${
      entry.failedChecks.length ? ` fail=[${entry.failedChecks.join(",")}]` : ""
    }`
  );

  await context.close();
}

function writeChecklist(manifest) {
  const lines = [
    "# Human smoke — Crystal Showcase (실사 6장)",
    "",
    `Generated: ${manifest.at}`,
    `Photos: ${manifest.photos.join(", ")}`,
    `Preset: ${manifest.look} · Background: ${manifest.background}`,
    "",
    "## 보는 순서 (heart → cube)",
    "",
    "1. **02_canvas_upload_ready** — 사진이 크리스탈 안에 자연스럽게 들어갔는가?",
    "2. **03_canvas_pull_hold** — 정면 강조(pull) 구간이 ‘베스트샷’으로 보이는가?",
    "3. **04_viewport_pull_hold** — UI·여백·배경과 함께 봤을 때 어색하지 않은가?",
    "",
    "## 체크리스트 (각 형상마다 ☐)",
    "",
    "| 항목 | heart | cube |",
    "|------|-------|------|",
    "| 사진 왜곡·잘림 없음 | ☐ | ☐ |",
    "| 얼굴/피사체 중심 구도 OK | ☐ | ☐ |",
    "| 유리/반사가 과하지 않음 | ☐ | ☐ |",
    "| pull 구간이 ‘팔 만한’ 장면 | ☐ | ☐ |",
    "| cube: pull-hold 단일 정면 (중복 면 없음) | ☐ | ☐ |",
    "| 회전·모핑이 눈에 거슬리지 않음 | ☐ | ☐ |",
    "| **종합: 현장 시연 가능** | ☐ | ☐ |",
    "",
    "## 자동 캡처 결과 (참고)",
    "",
  ];

  for (const s of manifest.shapes) {
    lines.push(`### ${s.shapeId}`);
    lines.push(`- upload audit: ${s.uploadAuditPass ? "PASS" : "FAIL"}`);
    lines.push(`- shape audit: ${s.shapeAuditPass ? "PASS" : "FAIL"}`);
    if (s.failedChecks.length) lines.push(`- failed: ${s.failedChecks.join(", ")}`);
    lines.push(`- canvas pull-hold luma: ${s.canvasMetrics?.centerLuma?.toFixed(1) ?? "—"}`);
    lines.push("");
    for (const [key, rel] of Object.entries(s.screenshots)) {
      lines.push(`- ${key}: \`experiments/outputs/${rel}\``);
    }
    lines.push("");
  }

  lines.push("## 메모");
  lines.push("");
  lines.push("_여기에 사람 눈 기준 코멘트:_");
  lines.push("");

  writeFileSync(join(outRoot, "CHECKLIST.md"), lines.join("\n"), "utf8");
}

await waitForDevServer();
const photos = listRealPhotos();
mkdirSync(outRoot, { recursive: true });

console.log(`human-smoke: ${photoCount} Kakao JPGs → shapes [${shapes.join(", ")}]`);
console.log(`Output: ${outRoot}`);

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

const manifest = {
  at: new Date().toISOString(),
  photos: photos.map((p) => p.split(/[/\\]/).pop()),
  look,
  background: bg,
  shapes: [],
};

try {
  for (const shapeId of shapes) {
    await captureShape(browser, shapeId, photos, manifest);
  }
} finally {
  await browser.close();
}

writeFileSync(join(outRoot, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
writeChecklist(manifest);

const allAutoPass = manifest.shapes.every((s) => s.uploadAuditPass && s.shapeAuditPass);
console.log(`\nDone → ${outRoot}`);
console.log(`Open CHECKLIST.md and review PNGs (human judgment required).`);
console.log(`Auto technical pre-check: ${allAutoPass ? "PASS" : "FAIL"}`);
process.exit(allAutoPass ? 0 : 1);
