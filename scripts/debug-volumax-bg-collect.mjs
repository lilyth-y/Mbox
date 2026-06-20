#!/usr/bin/env node
/** Collect runtime VoluMax bg debug evidence → debug-1c96c9.log */
import { existsSync, appendFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const logPath = join(root, "debug-1c96c9.log");
const WEB_URL =
  process.env.WEB_URL ??
  `http://localhost:5173/wedding-simple/index.html?v=volumax-bg5&_=${Date.now()}`;

const sample =
  [
    join(root, "wedding_2d_input.jpg"),
    join(root, "PR_deck/brosher/assets/wedding/image1.png"),
  ].find((p) => existsSync(p)) ?? null;

if (!sample) {
  console.error("no sample image");
  process.exit(1);
}

function writeLog(entry) {
  appendFileSync(logPath, `${JSON.stringify({ sessionId: "1c96c9", ...entry })}\n`);
}

function canvasStats(page) {
  return page.evaluate(() => {
    const c = document.querySelector("#canvas-container canvas");
    if (!(c instanceof HTMLCanvasElement) || c.width < 1) return null;
    const tmp = document.createElement("canvas");
    tmp.width = c.width;
    tmp.height = c.height;
    tmp.getContext("2d").drawImage(c, 0, 0);
    const w = c.width;
    const h = c.height;
    const cx = Math.floor(w * 0.5);
    const cy = Math.floor(h * 0.5);
    const r = Math.floor(Math.min(w, h) * 0.22);
    const data = tmp.getContext("2d").getImageData(cx - r, cy - r, r * 2, r * 2).data;
    let nonBlack = 0;
    let n = 0;
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) {
      const lum = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      sum += lum;
      if (lum > 12) nonBlack += 1;
      n += 1;
    }
    return {
      nonBlackRatio: nonBlack / n,
      meanLum: sum / n,
      pureBlack: nonBlack / n < 0.08,
    };
  });
}

async function snapshot(page, phase) {
  return page.evaluate((phaseName) => {
    let ring = [];
    try {
      ring = JSON.parse(localStorage.getItem("mboxDebugRing") || "[]");
    } catch {
      ring = window.mboxDebugRing?.() ?? [];
    }
    return {
      phase: phaseName,
      status: document.getElementById("volumax-status")?.textContent ?? "",
      layerSummary: window.mboxDebugLayerSummary?.() ?? [],
      faces: window.mboxInspectVoluMaxFaces?.() ?? null,
      ringTail: ring.slice(-8),
    };
  }, phase);
}

writeLog({ runId: "post-fix-v3", location: "collect", message: "start", timestamp: Date.now() });

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });

try {
  await page.addInitScript(() => {
    window.__mboxDebugRunId = "post-fix-v2";
  });
  await page.goto(WEB_URL, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.locator('input[type="file"]').first().setInputFiles([sample, sample, sample]);
  await page.locator("#start-ai-btn").click();
  await page.waitForFunction(
    () => !document.getElementById("step-3-view")?.classList.contains("hidden"),
    undefined,
    { timeout: 480_000 }
  );
  await page.waitForFunction(
    () => {
      const t = document.getElementById("volumax-status")?.textContent || "";
      const summary = window.mboxDebugLayerSummary?.() ?? [];
      return summary.length >= 3 && summary.every((x) => x.appDualLayer) || /레이어 준비 실패/.test(t);
    },
    undefined,
    { timeout: 600_000 }
  );
  await page.waitForTimeout(1500);

  const before = await snapshot(page, "step3-after-auto-prepare");
  const canvasBefore = await canvasStats(page);
  writeLog({
    runId: "post-fix",
    hypothesisId: "D",
    message: "before oneclick",
    data: { before, canvasBefore },
    timestamp: Date.now(),
  });

  await page.locator("#step-3-view .volumax-oneclick-btn").click();
  await page.waitForFunction(
    () => /원클릭 완료|VoluMax \d+\/\d+면/.test(document.getElementById("volumax-status")?.textContent || ""),
    undefined,
    { timeout: 600_000 }
  );
  await page.waitForTimeout(2000);

  const after = await snapshot(page, "after-oneclick");
  const canvasAfter = await canvasStats(page);
  writeLog({
    runId: "post-fix",
    hypothesisId: "B,J",
    message: "after oneclick",
    data: { after, canvasAfter },
    timestamp: Date.now(),
  });

  await page.waitForTimeout(7000);
  await page.evaluate(() => window.mboxProbeVoluMaxParallax?.());
  await page.waitForTimeout(400);

  const hold = await snapshot(page, "showcase-hold");
  const canvasHold = await canvasStats(page);
  writeLog({
    runId: "post-fix",
    hypothesisId: "B,J",
    message: "showcase hold",
    data: { hold, canvasHold },
    timestamp: Date.now(),
  });

  const ok =
    before.layerSummary?.every((x) => x.appDualLayer && !x.plateSameAsFg) &&
    after.layerSummary?.every((x) => x.appDualLayer && !x.plateSameAsFg) &&
    hold.faces?.faces?.every((f) => f.bgVisible) &&
    !canvasAfter?.pureBlack;

  writeLog({
    runId: "post-fix",
    message: "verdict",
    data: { ok, canvasHold, layerSummary: hold.layerSummary },
    timestamp: Date.now(),
  });

  console.log(JSON.stringify({ ok, canvasBefore, canvasAfter, canvasHold, hold: hold.layerSummary }, null, 2));
  if (!ok) process.exit(1);
} catch (err) {
  writeLog({
    runId: "post-fix",
    message: "error",
    data: { error: err instanceof Error ? err.message : String(err) },
    timestamp: Date.now(),
  });
  console.error(err);
  process.exit(1);
} finally {
  await browser.close();
}
