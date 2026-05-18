#!/usr/bin/env node
/**
 * E2E: upload → analyze → batch background removal (browser IMG.LY, no Vertex image API).
 *
 * Prereq: npm run dev (API 8787 + web 5173)
 *   node scripts/verify-background-removal.mjs
 */
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "experiments", "outputs", "bg_removal_verify");
const WEB_URL = process.env.WEB_URL ?? "http://localhost:5173";
const API_URL = process.env.API_URL ?? "http://localhost:8787";
const SAMPLE_COUNT = Number(process.env.MBOX_SAMPLE_COUNT ?? "2");
const REMOVAL_TIMEOUT_MS = Number(process.env.REMOVAL_TIMEOUT_MS ?? 900_000);
const assetDir = join(root, "data", "asset", "temp_1778692001076.-1818431043");

mkdirSync(outDir, { recursive: true });

let ok = true;
const logLines = [];
const log = (msg) => {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  logLines.push(line);
};

async function check(name, fn) {
  try {
    const detail = await fn();
    log(`OK ${name}${detail ? `: ${detail}` : ""}`);
    return true;
  } catch (error) {
    ok = false;
    log(`FAIL ${name}: ${error instanceof Error ? error.message : error}`);
    return false;
  }
}

const health = await fetch(`${API_URL}/health`);
await check("api /health", async () => {
  if (!health.ok) throw new Error(String(health.status));
  return await health.text();
});

const jpgs = existsSync(assetDir)
  ? readdirSync(assetDir)
      .filter((f) => /^KakaoTalk_.*\.jpg$/i.test(f))
      .sort()
      .slice(0, SAMPLE_COUNT)
      .map((f) => join(assetDir, f))
  : [];

if (jpgs.length < SAMPLE_COUNT) {
  console.error(`Need ${SAMPLE_COUNT} JPGs in ${assetDir}`);
  process.exit(1);
}

const browser = await chromium.launch({
  headless: process.env.MBOX_HEADED !== "1",
  args: ["--use-gl=angle", "--ignore-gpu-blocklist"],
});

const consoleErrors = [];
const apiRequests = [];
const page = await browser.newPage();
page.on("request", (req) => {
  const url = req.url();
  if (/\/analyze|\/edit|\/workspace/.test(url)) {
    apiRequests.push(url);
  }
});
page.on("console", (msg) => {
  if (msg.type() === "error") {
    consoleErrors.push(msg.text());
  }
});

try {
  await check("web loads", async () => {
    await page.goto(WEB_URL, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.waitForFunction(
      () => document.body.innerText.includes("보관함을 불러왔습니다"),
      undefined,
      { timeout: 60_000 }
    );
    const body = await page.locator("body").innerText();
    if (body.includes("asia-northeast3.run.app") && !body.includes("localhost:8787")) {
      throw new Error("web is pointing at cloud API — use apps/web/.env with localhost:8787");
    }
    return page.url();
  });

  await check("upload sample images", async () => {
    await page.locator('input[type="file"]').setInputFiles(jpgs);
    return `${jpgs.length} files`;
  });

  await check("select original preprocess mode", async () => {
    await page.getByRole("button", { name: /1\. 사진 원본/ }).click();
    return "original";
  });

  await check("analyze and crop", async () => {
    await page.getByRole("button", { name: /분석·크롭 시작/ }).click();
    await page.waitForFunction(
      (count) => {
        const t = document.body.innerText;
        if (/처리 중 오류|API에 연결할 수 없습니다|Vertex request failed/.test(t)) {
          return false;
        }
        const galleryMatch = t.match(/(\d+)\s*개\s*·/);
        return galleryMatch && Number(galleryMatch[1]) >= count;
      },
      SAMPLE_COUNT,
      { timeout: 600_000, polling: 1500 }
    );
    const analyzeHit = apiRequests.find((u) => u.includes("/analyze"));
    if (analyzeHit && !analyzeHit.includes("localhost") && !analyzeHit.includes("127.0.0.1")) {
      throw new Error(`analyze used non-local API: ${analyzeHit}`);
    }
    return "gallery populated";
  });

  await page.screenshot({ path: join(outDir, "01_before_removal.png"), fullPage: true });

  await check("batch background removal", async () => {
    const batchBtn = page.getByRole("button", {
      name: new RegExp(`보관함 전체 배경 제거 \\(${SAMPLE_COUNT}장\\)`),
    });
    await batchBtn.waitFor({ state: "visible", timeout: 15_000 });
    if (await batchBtn.isDisabled()) {
      throw new Error("batch button disabled — gallery may be empty");
    }
    await batchBtn.click();

    await page.waitForFunction(
      (count) => {
        const t = document.body.innerText;
        if (/일괄 배경 제거 중 오류|Vertex request failed|404/.test(t)) {
          return false;
        }
        if (/일괄 배경 제거 중\.\.\./.test(t)) {
          return false;
        }
        return (
          new RegExp(`${count}장이 누끼`).test(t) ||
          /모든 이미지에 배경 제거가 적용/.test(t) ||
          /브라우저 AI 분리 완료/.test(t)
        );
      },
      SAMPLE_COUNT,
      { timeout: REMOVAL_TIMEOUT_MS, polling: 2000 }
    );

    const status = await page.locator("header").innerText();
    if (/오류|Vertex request failed|404/.test(status)) {
      throw new Error(status.slice(0, 300));
    }
    return status.match(/누끼|배경 제거/)?.[0] ?? "completed";
  });

  await page.screenshot({ path: join(outDir, "02_after_removal.png"), fullPage: true });

  await check("no critical console errors", async () => {
    const bad = consoleErrors.filter(
      (e) => !/favicon|Failed to load resource.*favicon/i.test(e)
    );
    if (bad.length > 0) {
      throw new Error(bad.slice(0, 3).join(" | "));
    }
    return `${consoleErrors.length} total`;
  });
} finally {
  await browser.close();
}

writeFileSync(join(outDir, "verify_log.txt"), logLines.join("\n"), "utf8");
process.exit(ok ? 0 : 1);
