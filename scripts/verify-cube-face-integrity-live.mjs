#!/usr/bin/env node
/**
 * Live WebGL check: cube scene loads with 6 intact faces (structural audit in browser).
 * Requires dev servers: api :8787, web :5173
 *
 *   node scripts/verify-cube-face-integrity-live.mjs
 */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { waitForApiReady } from "./lib/wait-for-api.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const WEB = process.env.WEB_URL ?? "http://localhost:5173";
const sample =
  [
    join(root, "wedding_2d_input.jpg"),
    join(root, "PR_deck/brosher/assets/wedding/image1.png"),
  ].find((path) => existsSync(path)) ?? null;

if (!sample) {
  console.error("verify-cube-face-integrity-live: no sample image in repo");
  process.exit(1);
}

await waitForApiReady("http://127.0.0.1:8787", 90_000);

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--ignore-gpu-blocklist", "--enable-webgl"],
});

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  await page.goto(WEB, { waitUntil: "domcontentloaded", timeout: 60_000 });

  await page.getByRole("button", { name: "프로세싱" }).click();
  await page.locator('input[type="file"]').setInputFiles([sample, sample, sample]);
  await page.getByRole("button", { name: /분석·크롭 시작/ }).click();
  await page.waitForFunction(
    () =>
      /처리 완료|보관함/.test(document.body.innerText) &&
      !document.body.innerText.includes("분석 중"),
    undefined,
    { timeout: 300_000 }
  );

  await page.getByRole("button", { name: /3D 큐브/ }).click();
  await page.waitForSelector("canvas", { timeout: 60_000 });
  await page.waitForFunction(
    () => typeof window.__mboxCubeFaceAudit === "function",
    undefined,
    { timeout: 120_000 }
  );

  const audit = await page.evaluate(() => {
    const fn = window.__mboxCubeFaceAudit;
    if (!fn) {
      return { ok: false, error: "audit hook missing" };
    }
    return fn();
  });

  const canvasLuma = await page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    if (!canvas) {
      return { ok: false, reason: "no canvas" };
    }
    const w = canvas.width;
    const h = canvas.height;
    const tmp = document.createElement("canvas");
    tmp.width = w;
    tmp.height = h;
    const ctx = tmp.getContext("2d");
    if (!ctx) {
      return { ok: false, reason: "no 2d ctx" };
    }
    ctx.drawImage(canvas, 0, 0);
    const cx = Math.floor(w * 0.5);
    const cy = Math.floor(h * 0.5);
    const patch = ctx.getImageData(cx - 40, cy - 40, 80, 80).data;
    let sum = 0;
    const n = patch.length / 4;
    for (let i = 0; i < patch.length; i += 4) {
      sum += patch[i]! + patch[i + 1]! + patch[i + 2]!;
    }
    const meanLuma = sum / (n * 3);
    return { ok: meanLuma > 12, meanLuma: +meanLuma.toFixed(1), w, h };
  });

  const pass = audit.ok === true && canvasLuma.ok === true;
  const payload = {
    ok: pass,
    audit,
    canvasLuma,
    sample,
  };
  console.log(JSON.stringify(payload, null, 2));

  if (!pass) {
    console.error("verify-cube-face-integrity-live: FAIL");
    process.exit(1);
  }
  console.log("verify-cube-face-integrity-live: OK");
} finally {
  await browser.close();
}
