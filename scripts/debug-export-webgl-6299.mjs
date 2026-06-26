#!/usr/bin/env node
import { chromium } from "playwright";
import { appendFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const logPath = join(root, "debug-6299d2.log");
const baseUrl = process.argv[2] ?? "http://localhost:5173/showcase.html";

function writeLog(entry) {
  appendFileSync(
    logPath,
    `${JSON.stringify({ sessionId: "6299d2", ...entry, timestamp: Date.now() })}\n`
  );
}

const contextLossEvents = [];
const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--ignore-gpu-blocklist", "--enable-webgl"],
});
const page = await browser.newPage();

page.on("console", (msg) => {
  const text = msg.text();
  if (/CONTEXT_LOST|context lost|WebGL context/i.test(text)) {
    contextLossEvents.push({ type: msg.type(), text: text.slice(0, 200) });
    writeLog({
      location: "debug-export-webgl-6299.mjs",
      message: "context_event",
      hypothesisId: "F",
      data: { type: msg.type(), text: text.slice(0, 200) },
      runId: "export-smoke",
    });
  }
});

writeLog({
  location: "debug-export-webgl-6299.mjs",
  message: "export_smoke_start",
  hypothesisId: "F",
  data: { baseUrl },
  runId: "export-smoke",
});

await page.goto(baseUrl, { waitUntil: "load", timeout: 120_000 });
await page.waitForFunction(
  () => {
    const btn = Array.from(document.querySelectorAll("button")).find((b) =>
      /MP4/i.test(b.textContent ?? "")
    );
    return btn && !btn.disabled;
  },
  undefined,
  { timeout: 120_000 }
);

const dbgBefore = await page.evaluate(() => window.__dbg6299 ?? []);
writeLog({
  location: "debug-export-webgl-6299.mjs",
  message: "pre_export_dbg",
  hypothesisId: "F",
  data: { entries: dbgBefore },
  runId: "export-smoke",
});

const exportBtn = page.locator("button", { hasText: /MP4/ }).first();
await exportBtn.click();

for (let i = 0; i < 8; i++) {
  await page.waitForTimeout(2000);
  const state = await page.evaluate(() => ({
    recording: Array.from(document.querySelectorAll("button")).some((b) =>
      /생성 중/.test(b.textContent ?? "")
    ),
    exportMsg: document.body.innerText.match(/녹화|렌더|MP4|WebGL[^\n]*/)?.[0] ?? null,
    dbg: window.__dbg6299 ?? [],
  }));
  writeLog({
    location: "debug-export-webgl-6299.mjs",
    message: "export_tick",
    hypothesisId: "F",
    data: { tSec: (i + 1) * 2, ...state, contextLossCount: contextLossEvents.length },
    runId: "export-smoke",
  });
}

await browser.close();
writeLog({
  location: "debug-export-webgl-6299.mjs",
  message: "export_smoke_end",
  hypothesisId: "F",
  data: { contextLossCount: contextLossEvents.length, events: contextLossEvents },
  runId: "export-smoke",
});
console.log(JSON.stringify({ contextLossCount: contextLossEvents.length, logPath }, null, 2));
