#!/usr/bin/env node
/**
 * Live dev check: VoluMax layers + depth ON on localhost:5173 (main + wedding-simple).
 *   node scripts/verify-volumax-applied-live.mjs
 */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { waitForApiReady } from "./lib/wait-for-api.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const WEB = process.env.WEB_URL ?? "http://localhost:5173";
const sample =
  [join(root, "wedding_2d_input.jpg"), join(root, "PR_deck/brosher/assets/wedding/image1.png")].find(
    (p) => existsSync(p)
  ) ?? null;

if (!sample) {
  console.error("No sample image");
  process.exit(1);
}

await waitForApiReady("http://127.0.0.1:8787", 60_000);

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--ignore-gpu-blocklist", "--enable-webgl"],
});

const results = { weddingSimple: null, mainCube: null };

async function verifyWeddingSimple() {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(`${WEB}/wedding-simple/index.html?_=${Date.now()}`, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });

  await page.locator('input[type="file"]').first().setInputFiles([sample, sample, sample]);
  await page.waitForSelector("#selected-images-wrap:not(.hidden)", { timeout: 15_000 });
  await page.locator("#start-ai-btn").click();
  await page.waitForFunction(
    () => {
      const step3 = document.getElementById("step-3-view");
      return step3 && !step3.classList.contains("hidden");
    },
    undefined,
    { timeout: 300_000 }
  );

  await page.evaluate(() => {
    document.querySelectorAll(".volumax-depth-cb").forEach((el) => {
      el.checked = true;
      el.dispatchEvent(new Event("change", { bubbles: true }));
    });
  });

  await page.waitForFunction(
    () => {
      const t = document.getElementById("volumax-status")?.textContent || "";
      return /VoluMax\s+[1-9]\d*\/\d+면/.test(t) && /깊이 분리 ON/.test(t);
    },
    undefined,
    { timeout: 120_000 }
  );

  const depthApplied = await page.evaluate(() => {
    const status = document.getElementById("volumax-status")?.textContent || "";
    const depthOn = Boolean(document.querySelector(".volumax-depth-cb")?.checked);
    const hasCanvas = Boolean(document.querySelector("#three-canvas, canvas"));
    return { status, depthOn, hasCanvas };
  });

  await page.close();
  const pass =
    depthApplied.depthOn &&
    /VoluMax\s+[1-9]\d*\/\d+면/.test(depthApplied.status) &&
    /깊이 분리 ON/.test(depthApplied.status);
  return { pass, ...depthApplied };
}

async function verifyMainCube() {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  await page.goto(WEB, { waitUntil: "domcontentloaded", timeout: 60_000 });

  await page.getByRole("button", { name: "프로세싱" }).click();
  await page.locator('input[type="file"]').setInputFiles([sample, sample, sample]);
  await page.getByRole("button", { name: /분석·크롭 시작/ }).click();
  await page.waitForFunction(
    () => /처리 완료|보관함/.test(document.body.innerText) && !document.body.innerText.includes("분석 중"),
    undefined,
    { timeout: 300_000 }
  );

  await page.getByRole("button", { name: /3D 큐브/ }).click();
  await page.getByText(/재생 3장|재생 [1-9]/).waitFor({ timeout: 60_000 });

  const prepareBtn = page.getByRole("button", { name: /지금 VoluMax 레이어 준비/ });
  await prepareBtn.click();
  await page.waitForFunction(
    () =>
      /VoluMax 레이어가 준비|원본 배경 플레이트가 준비/.test(document.body.innerText) ||
      /VoluMax 적용 \d+\/\d+면/.test(document.body.innerText),
    undefined,
    { timeout: 180_000 }
  );

  const depthCb = page.getByRole("checkbox", { name: /VoluMax 깊이 분리/ });
  await depthCb.check();
  await page.getByRole("button", { name: /연출 적용/ }).first().click();
  await page.waitForTimeout(2500);

  await page.waitForFunction(
    () => /VoluMax 적용 \d+\/\d+면/.test(document.body.innerText),
    undefined,
    { timeout: 30_000 }
  ).catch(() => {});

  const snapshot = await page.evaluate(() => {
    const depthOn = Array.from(document.querySelectorAll("label")).some((label) => {
      if (!/VoluMax 깊이 분리/.test(label.innerText)) return false;
      const cb = label.querySelector('input[type="checkbox"]');
      return cb?.checked === true;
    });
    const appliedLine =
      document.body.innerText.match(/VoluMax 적용 (\d+)\/(\d+)면/) ?? null;
    const layerWarn =
      document.body.innerText.match(/VoluMax 레이어 (\d+)\/(\d+)장/) ?? null;
    const canvas = document.querySelector("canvas");
    return {
      depthOn,
      appliedLine: appliedLine?.[0] ?? null,
      appliedN: appliedLine ? Number(appliedLine[1]) : 0,
      appliedTotal: appliedLine ? Number(appliedLine[2]) : 0,
      layerWarn: layerWarn?.[0] ?? null,
      hasCanvas: Boolean(canvas),
      canvasPx: canvas ? { w: canvas.width, h: canvas.height } : null,
      voluMaxSnippets: document.body.innerText.match(/VoluMax[^\n]*/g)?.slice(0, 8) ?? [],
    };
  });

  await page.screenshot({
    path: join(root, "experiments/outputs/volumax_applied_main.png"),
  });

  await page.close();
  const pass =
    snapshot.depthOn &&
    snapshot.appliedN >= 3 &&
    snapshot.appliedN === snapshot.appliedTotal &&
    snapshot.hasCanvas;
  return { pass, ...snapshot, screenshot: join(root, "experiments/outputs/volumax_applied_main.png") };
}

try {
  results.weddingSimple = await verifyWeddingSimple();
  results.mainCube = await verifyMainCube();
} finally {
  await browser.close();
}

const allPass = results.weddingSimple?.pass && results.mainCube?.pass;
console.log(JSON.stringify({ ok: allPass, results }, null, 2));
if (!allPass) {
  console.error("verify-volumax-applied-live: FAIL");
  process.exit(1);
}
console.log("verify-volumax-applied-live: OK");
