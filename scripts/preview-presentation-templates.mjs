/**
 * Capture wedding-simple canvas for each of the 5 presentation templates.
 * Requires dev server + API (npm run dev). Uses 1 sample image for speed.
 *
 *   npx tsx scripts/preview-presentation-templates.mjs
 */
import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { waitForApiReady } from "./lib/wait-for-api.mjs";
import { PRESENTATION_EFFECTS } from "../apps/web/src/features/cube/presentationEffects.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "experiments", "outputs", "presentation_template_previews");
const API_URL = process.env.API_URL ?? "http://localhost:8787";
const WEB_URL =
  process.env.WEB_URL ?? `http://localhost:5173/wedding-simple/index.html?api_url=${encodeURIComponent(API_URL)}`;
const sampleImage = join(root, "wedding_2d_input.jpg");

mkdirSync(outDir, { recursive: true });

async function canvasStats(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    if (!(canvas instanceof HTMLCanvasElement)) {
      return { ok: false, reason: "no canvas" };
    }
    const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
    if (!gl) {
      return { ok: false, reason: "no webgl" };
    }
    const w = canvas.width;
    const h = canvas.height;
    const pixels = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    const step = Math.max(1, Math.floor(Math.min(w, h) / 48));
    let nonBlack = 0;
    let n = 0;
    for (let y = 0; y < h; y += step) {
      for (let x = 0; x < w; x += step) {
        const i = (y * w + x) * 4;
        const l = 0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2];
        if (l > 8) nonBlack += 1;
        n += 1;
      }
    }
    return { ok: nonBlack / Math.max(1, n) > 0.01, w, h, nonBlackRatio: nonBlack / Math.max(1, n) };
  });
}

if (!existsSync(sampleImage)) {
  console.error(`Missing sample image: ${sampleImage}`);
  process.exit(1);
}

await waitForApiReady(API_URL, 60_000);

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--ignore-gpu-blocklist", "--enable-webgl"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

const results = [];

try {
  await page.goto(WEB_URL, { waitUntil: "networkidle", timeout: 120_000 });
  await page.locator('input[type="file"]').setInputFiles([sampleImage, sampleImage, sampleImage]);
  await page.waitForFunction(
    () => {
      const btn = document.getElementById("start-ai-btn");
      return btn instanceof HTMLButtonElement && !btn.disabled;
    },
    undefined,
    { timeout: 30_000 },
  );
  await page.locator("#start-ai-btn").click();

  await page.waitForFunction(
    () => {
      const step3 = document.getElementById("step-3-view");
      return step3 && !step3.classList.contains("hidden");
    },
    undefined,
    { timeout: 300_000 },
  );

  await page.waitForTimeout(1500);

  for (const effect of PRESENTATION_EFFECTS) {
    await page.locator(`[data-effect="${effect.id}"]`).click();
    await page.waitForTimeout(2500);
    const stats = await canvasStats(page);
    const fileName = `${effect.id}.png`;
    const shotPath = join(outDir, fileName);
    await page.locator("canvas").first().screenshot({ path: shotPath });
    const shotBytes = statSync(shotPath).size;
    const canvasOk = stats.ok || shotBytes > 12_000;
    results.push({
      id: effect.id,
      label: effect.label,
      moodLabel: effect.moodLabel,
      canvasOk,
      nonBlackRatio: stats.nonBlackRatio,
      screenshotBytes: shotBytes,
      screenshot: `experiments/outputs/presentation_template_previews/${fileName}`,
    });
    console.log(
      `[${canvasOk ? "OK" : "WARN"}] ${effect.id} (${effect.moodLabel}) bytes=${shotBytes} nonBlack=${stats.nonBlackRatio?.toFixed?.(4) ?? "?"}`,
    );
  }
} finally {
  await browser.close();
}

const report = {
  ok: results.every((r) => r.canvasOk),
  webUrl: WEB_URL,
  generatedAt: new Date().toISOString(),
  templates: results,
};

writeFileSync(join(outDir, "report.json"), JSON.stringify(report, null, 2), "utf8");
writeFileSync(
  join(outDir, "README.md"),
  [
    "# Presentation template previews",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "| # | ID | 연출 느낌 | Canvas | Preview |",
    "|---|-----|-----------|--------|---------|",
    ...results.map(
      (r, i) =>
        `| ${i + 1} | \`${r.id}\` | ${r.moodLabel} | ${r.canvasOk ? "OK" : "empty"} | ![](${r.id}.png) |`,
    ),
  ].join("\n"),
  "utf8",
);

if (!report.ok) {
  console.error("preview-presentation-templates: some canvases empty", report);
  process.exit(1);
}
console.log(`preview-presentation-templates: OK → ${outDir}`);
