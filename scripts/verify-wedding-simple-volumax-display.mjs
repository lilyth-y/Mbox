#!/usr/bin/env node
/**
 * Verify VoluMax dual-layer display: bg plate visible when depth OFF;
 * fg Z-pop when depth ON without burying bg (bg Z fixed).
 */
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "experiments", "outputs");
mkdirSync(outDir, { recursive: true });

const WEB_URL =
  process.env.WEB_URL ??
  `http://localhost:5173/wedding-simple/index.html?_=${Date.now()}`;

const sample =
  [
    join(root, "wedding_2d_input.jpg"),
    join(root, "PR_deck/brosher/assets/wedding/image1.png"),
    join(root, "data/asset/temp_1778692001076.-1818431043/KakaoTalk_20250310123456_01.jpg"),
  ].find((p) => existsSync(p)) ?? null;

if (!sample) {
  console.error("verify-wedding-simple-volumax-display: no sample image");
  process.exit(1);
}

async function sampleCanvas(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector("#canvas-container canvas");
    if (!(canvas instanceof HTMLCanvasElement)) {
      return { ok: false, reason: "no canvas" };
    }
    const w = canvas.width;
    const h = canvas.height;
    const tmp = document.createElement("canvas");
    tmp.width = w;
    tmp.height = h;
    const ctx = tmp.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(canvas, 0, 0);
    const cx = Math.floor(w * 0.5);
    const cy = Math.floor(h * 0.5);
    const r = Math.floor(Math.min(w, h) * 0.22);
    const data = ctx.getImageData(cx - r, cy - r, r * 2, r * 2).data;
    let n = 0;
    let nonBlack = 0;
    let sum = 0;
    let sum2 = 0;
    for (let i = 0; i < data.length; i += 4) {
      const lum = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      sum += lum;
      sum2 += lum * lum;
      if (lum > 12) nonBlack += 1;
      n += 1;
    }
    const mean = sum / n;
    const variance = sum2 / n - mean * mean;
    return {
      ok: true,
      nonBlackRatio: nonBlack / n,
      meanLum: mean,
      variance,
      pureBlack: nonBlack / n < 0.08,
    };
  });
}

async function inspectFaces(page) {
  return page.evaluate(() => {
    if (typeof window.mboxInspectVoluMaxFaces !== "function") {
      return { err: "mboxInspectVoluMaxFaces missing" };
    }
    return window.mboxInspectVoluMaxFaces();
  });
}

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--ignore-gpu-blocklist", "--enable-webgl"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });

const report = { ok: false, steps: [] };

try {
  await page.goto(WEB_URL, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.locator('input[type="file"]').first().setInputFiles([sample, sample, sample]);
  await page.locator("#start-ai-btn").click();
  await page.waitForFunction(
    () => {
      const step3 = document.getElementById("step-3-view");
      return step3 && !step3.classList.contains("hidden");
    },
    undefined,
    { timeout: 480_000 }
  );
  report.steps.push({ step: "step3_ready" });

  await page.locator("#step-3-view .volumax-oneclick-btn").click();
  await page.waitForFunction(
    () => {
      const t = document.getElementById("volumax-status")?.textContent || "";
      return /원클릭 완료|VoluMax \d+\/\d+면/.test(t);
    },
    undefined,
    { timeout: 600_000 }
  );
  const statusAfterOneClick = await page.textContent("#volumax-status");
  report.steps.push({ step: "oneclick", status: statusAfterOneClick });

  await page.waitForTimeout(2000);

  const probeOn = await page.evaluate(() => window.mboxProbeVoluMaxParallax?.());
  let facesOn = probeOn ?? (await inspectFaces(page));
  let canvasOn = await sampleCanvas(page);
  report.depthOn = { faces: facesOn, canvas: canvasOn };

  await page.evaluate(() => {
    document.querySelectorAll(".volumax-depth-cb").forEach((el) => {
      el.checked = false;
      el.dispatchEvent(new Event("change", { bubbles: true }));
    });
  });
  await page.waitForTimeout(1500);

  const probeOff = await page.evaluate(() => {
    window.mboxInspectVoluMaxFaces?.();
    return window.mboxInspectVoluMaxFaces();
  });
  let facesOff = probeOff ?? (await inspectFaces(page));
  let canvasOff = await sampleCanvas(page);
  report.depthOff = { faces: facesOff, canvas: canvasOff };

  const activeFaceIdx = facesOff?.activeFaceIndex ?? 4;
  const faceOff = facesOff?.faces?.find((f) => f.faceIndex === activeFaceIdx);
  const faceOnPeak = facesOn?.faces?.find((f) => f.faceIndex === activeFaceIdx);
  const bgVisibleOff = faceOff?.bgVisible === true;
  const bgZFixed =
    faceOff?.bgZ != null &&
    faceOnPeak?.bgZ != null &&
    Math.abs(faceOff.bgZ - faceOnPeak.bgZ) < 0.001;
  const fgZPopOn =
    faceOnPeak?.fgZ != null &&
    faceOff?.fgZ != null &&
    faceOnPeak.fgZ > faceOff.fgZ + 0.04;

  const notPureBlackOff = !canvasOff?.pureBlack;
  const notPureBlackOn = !canvasOn?.pureBlack;

  report.checks = {
    bgVisibleOff,
    bgZFixed,
    fgZPopOn,
    notPureBlackOff,
    notPureBlackOn,
  };

  report.ok =
    !facesOff?.err &&
    bgVisibleOff &&
    bgZFixed &&
    notPureBlackOff &&
    notPureBlackOn;

  console.log(JSON.stringify(report, null, 2));

  if (!report.ok) {
    process.exit(1);
  }
  console.log("verify-wedding-simple-volumax-display: OK");
} catch (err) {
  report.error = err instanceof Error ? err.message : String(err);
  console.log(JSON.stringify(report, null, 2));
  await page.screenshot({ path: join(outDir, "volumax_verify_error.png") }).catch(() => {});
  process.exit(1);
} finally {
  await browser.close();
}
