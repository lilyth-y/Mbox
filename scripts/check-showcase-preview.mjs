#!/usr/bin/env node
import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "experiments", "outputs", "preview-check");
mkdirSync(outDir, { recursive: true });

const url =
  process.env.MBOX_SHOWCASE_URL ??
  "http://localhost:5173/showcase.html?look=rose_gold_premium&bg=booth&profile=1";

const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--use-gl=angle", "--ignore-gpu-blocklist", "--enable-webgl"],
});
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const consoleTail = [];
page.on("console", (m) => {
  const t = m.text();
  if (/error|context lost|WebGL|showcase|jewel/i.test(t)) {
    consoleTail.push(`[${m.type()}] ${t}`);
  }
});

const res = await page.goto(url, { waitUntil: "load", timeout: 60_000 });
const timeline = [];
for (let i = 0; i < 30; i++) {
  await page.waitForTimeout(3000);
  const snap = await page.evaluate(() => {
    const body = document.body.innerText;
    const overlay = document.querySelector(".absolute.inset-0.z-10");
    const overlayText = overlay?.innerText?.trim() ?? "";
    const report = window.__MBOX_SHOWCASE_RESOURCE_REPORT__;
    return {
      blocked: Boolean(overlay && overlayText.length > 0),
      overlayHead: overlayText.slice(0, 120),
      hardError:
        body.includes("만들지 못했습니다") ||
        body.includes("끊겼습니다. 새로고침"),
      stabilizing: body.includes("미리보기 안정화"),
      status:
        body.match(/\d+장 · [^\n]+/)?.[0] ??
        body.match(/표출 · \d+\/\d+/)?.[0] ??
        null,
      phases: report?.phases?.map((p) => p.phase) ?? null,
      gpuTier: report?.gpuTier ?? null,
      jewel: report?.phases?.some((p) => p.phase === "jewel_spawn") ?? false,
      hasBackdropVideo: Boolean(
        document.querySelector(
          ".showcase-dom-backdrop, [data-showcase-backdrop='primary']"
        )
      ),
    };
  });
  timeline.push({ sec: (i + 1) * 3, ...snap });
  console.log(JSON.stringify(timeline[timeline.length - 1]));
  if (!snap.blocked && snap.jewel && snap.status && !snap.hardError) {
    break;
  }
  if (snap.hardError) {
    break;
  }
}

const shotPath = join(outDir, "latest.png");
await page.screenshot({ path: shotPath, fullPage: false });
await browser.close();

const last = timeline[timeline.length - 1];
const ok = !last?.blocked && !last?.hardError && last?.jewel && Boolean(last?.status);
const report = { url, http: res?.status(), ok, last, timeline, consoleTail: consoleTail.slice(-15), shotPath };
writeFileSync(join(outDir, "latest-report.json"), JSON.stringify(report, null, 2));
console.log("\nRESULT ok=", ok, "shot=", shotPath);
