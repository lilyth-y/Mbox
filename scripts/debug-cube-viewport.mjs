/**
 * Diagnose cube viewport sizing + WebGL on main app and wedding-simple.
 *   npx tsx scripts/debug-cube-viewport.mjs
 */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { waitForApiReady } from "./lib/wait-for-api.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const API_URL = process.env.API_URL ?? "http://localhost:8787";
const sampleImage = join(root, "wedding_2d_input.jpg");

async function probe(page, label) {
  return page.evaluate((tag) => {
    const canvas = document.querySelector("canvas");
    const mount =
      document.querySelector(".fan-blade-backdrop__canvas > div") ??
      document.querySelector(".fan-blade-backdrop__canvas") ??
      document.getElementById("canvas-container") ??
      document.querySelector(".cube-canvas-mount");
    const mountRect = mount instanceof HTMLElement ? mount.getBoundingClientRect() : null;
    const canvasRect = canvas instanceof HTMLCanvasElement ? canvas.getBoundingClientRect() : null;
    return {
      tag,
      mount: mount
        ? {
            className: mount.className,
            clientW: mount.clientWidth,
            clientH: mount.clientHeight,
            rect: mountRect
              ? { w: mountRect.width, h: mountRect.height }
              : null,
          }
        : null,
      canvas: canvas
        ? {
            w: canvas.width,
            h: canvas.height,
            cssW: canvasRect?.width,
            cssH: canvasRect?.height,
          }
        : null,
      errors: window.__cubeDebugErrors ?? [],
    };
  }, label);
}

await waitForApiReady(API_URL, 30_000).catch(() => {
  console.warn("API not ready — wedding-simple AI step may fail");
});

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--ignore-gpu-blocklist", "--enable-webgl"],
});

const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
page.on("pageerror", (err) => console.error("[pageerror]", err.message));
page.on("console", (msg) => {
  if (msg.type() === "error" || msg.text().includes("CubeView")) {
    console.log("[console]", msg.type(), msg.text());
  }
});

console.log("\n=== wedding-simple ===");
await page.goto(
  `http://localhost:5173/wedding-simple/index.html?api_url=${encodeURIComponent(API_URL)}`,
  { waitUntil: "networkidle", timeout: 120_000 },
);
if (existsSync(sampleImage)) {
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
  await page.waitForTimeout(2000);
}
console.log(JSON.stringify(await probe(page, "wedding-simple"), null, 2));

console.log("\n=== main app cube tab ===");
await page.goto("http://localhost:5173/", { waitUntil: "networkidle", timeout: 120_000 });
await page.getByRole("button", { name: /3D 큐브/ }).click();
await page.waitForTimeout(1500);
console.log(JSON.stringify(await probe(page, "main-no-images"), null, 2));

await browser.close();
