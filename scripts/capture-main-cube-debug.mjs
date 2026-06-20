#!/usr/bin/env node
import { chromium } from "playwright";
import { readFileSync, writeFileSync, unlinkSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const logPath = join(root, "debug-3f5f2e.log");
const cursorLogPath = join(root, ".cursor", "debug-3f5f2e.log");
const screenshotDir = join(root, ".cursor", "cube-capture");
const url = process.env.MBOX_URL ?? "http://localhost:5173/";
const api = process.env.MBOX_API ?? "http://localhost:8787";

function parseLogLines(path) {
  if (!existsSync(path)) {
    return [];
  }
  return readFileSync(path, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function analyzeLogs(entries) {
  const agent = entries.filter((e) => e.hypothesisId);
  const h50 = agent.filter((e) => e.hypothesisId === "H50");
  const h41 = agent.find((e) => e.hypothesisId === "H41");
  const frameSamples = agent.filter((e) => e.hypothesisId === "H1-H4");
  const showcaseSteps = new Set(
    frameSamples
      .filter((e) => e.data?.phase === "showcase_hold")
      .map((e) => e.data?.step)
  );
  const h50Steps = new Set(h50.map((e) => e.data?.textureStep));
  const bad = agent.filter((e) => {
    const d = e.data ?? {};
    if (d.facingMismatch === true) return true;
    if (typeof d.faceNormalDotZ === "number" && d.faceNormalDotZ < 0.85) return true;
    if (d.cubeShowcaseZoomEnabled === true) return true;
    if (d.visibleFaceGroups != null && d.visibleFaceGroups !== 6) return true;
    return false;
  });
  const runIds = [...new Set(agent.map((e) => e.runId).filter(Boolean))];

  return {
    runIds,
    h41: h41?.data ?? null,
    h50Steps: [...h50Steps].sort((a, b) => a - b),
    h50MinDotZ: Math.min(...h50.map((e) => e.data?.faceNormalDotZ ?? 1), 1),
    showcaseSteps: [...showcaseSteps].sort((a, b) => a - b),
    badCount: bad.length,
    badSamples: bad.slice(0, 5),
    pass:
      bad.length === 0 &&
      h50.length >= 1 &&
      (h41?.data?.faceRigs?.length === 6 || h41?.data?.imageCount > 0),
  };
}

try {
  unlinkSync(logPath);
} catch {
  /* ignore */
}
try {
  unlinkSync(cursorLogPath);
} catch {
  /* ignore */
}
mkdirSync(screenshotDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

try {
  const health = await fetch(`${api}/health`).catch(() => null);
  const apiUp = health?.ok;

  await page.goto(url, { waitUntil: "networkidle", timeout: 90000 });

  if (apiUp) {
    const batchBtn = page.getByRole("button", { name: /data\/asset|에셋 배치/i }).first();
    if (await batchBtn.count()) {
      await batchBtn.click();
      await page.waitForTimeout(22000);
    }
  }

  await page.getByRole("button", { name: /3D 큐브/i }).click();
  await page.waitForTimeout(35000);
  try {
    await page.screenshot({ path: join(screenshotDir, "step-mid.png"), fullPage: false });
  } catch {
    /* ignore */
  }
  await page.waitForTimeout(55000);

  const snapshot = await page.evaluate(() => {
    const logs = window.__mboxDebugLog ?? [];
    const recent = logs.slice(-25);
    const last = recent[recent.length - 1] ?? null;
    let sessionLast = null;
    try {
      sessionLast = JSON.parse(sessionStorage.getItem("mbox-debug-last") ?? "null");
    } catch {
      /* ignore */
    }
    const stepLabel = document.body.innerText.match(/\d+\/\d+/)?.[0] ?? null;
    return {
      logCount: logs.length,
      recent,
      last,
      sessionLast,
      stepLabel,
      hasCanvas: !!document.querySelector(".cube-canvas-mount canvas"),
    };
  });

  const fileEntries = parseLogLines(cursorLogPath).concat(parseLogLines(logPath));
  const analysis = analyzeLogs(fileEntries.length ? fileEntries : snapshot.recent);

  const report = {
    sessionId: "3f5f2e",
    runId: "playwright-capture-v13",
    message: "browser snapshot + log analysis",
    data: { snapshot, analysis },
    timestamp: Date.now(),
  };

  writeFileSync(logPath, `${JSON.stringify(report)}\n`, "utf8");

  console.log("logCount", snapshot.logCount);
  console.log("analysis", JSON.stringify(analysis, null, 2));
  if (snapshot.last?.data) {
    console.log("last sample step", snapshot.last.data.step, "dotZ", snapshot.last.data.faceNormalDotZ);
  }
  if (!analysis.pass) {
    process.exit(1);
  }
  if (snapshot.logCount === 0 && fileEntries.length === 0) {
    process.exit(2);
  }
} finally {
  await browser.close();
}
