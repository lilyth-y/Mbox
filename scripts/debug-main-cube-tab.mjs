/**
 * Debug main app cube tab with injected processed images.
 *   npx tsx scripts/debug-main-cube-tab.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sampleImage = join(root, "wedding_2d_input.jpg");

function toDataUrl(path) {
  const buf = readFileSync(path);
  return `data:image/jpeg;base64,${buf.toString("base64")}`;
}

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--ignore-gpu-blocklist", "--enable-webgl"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });

const logs = [];
page.on("console", (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
page.on("pageerror", (err) => logs.push(`[pageerror] ${err.message}`));

await page.goto("http://localhost:5173/", { waitUntil: "networkidle", timeout: 120_000 });

await page.evaluate(async (dataUrl) => {
  const images = Array.from({ length: 5 }, (_, i) => ({
    id: i + 1,
    url: dataUrl,
    byteSize: Math.floor(dataUrl.length * 0.75),
    sequenceOrder: i,
    caption: `shot ${i + 1}`,
    preprocessMode: "original",
    center: { x: 0.5, y: 0.5 },
  }));

  localStorage.setItem(
    "mbox.category.catalog.v1",
    JSON.stringify([{ id: "uncategorized", label: "미분류", system: true }]),
  );
  localStorage.setItem("mbox.category.assignments.v1", JSON.stringify({}));

  const events = [{ id: "evt-debug", name: "Debug Event", createdAt: Date.now() }];
  localStorage.setItem("mbox.events.v1", JSON.stringify(events));
  localStorage.setItem("mbox.activeEventId.v1", "evt-debug");
  localStorage.setItem(`mbox.eventVault.v1.evt-debug`, JSON.stringify(images));
}, existsSync(sampleImage) ? toDataUrl(sampleImage) : "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==");

await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(2000);

await page.getByRole("button", { name: /3D 큐브/ }).click();
await page.waitForTimeout(4000);

const probe = await page.evaluate(() => {
  const mount =
    document.querySelector(".cube-canvas-mount") ??
    document.querySelector(".fan-blade-backdrop__canvas > div");
  const canvas = document.querySelector("canvas");
  const emptyMsg = document.body.innerText.includes("큐브를 보려면 사진이 필요합니다");
  const loadingMsg = document.body.innerText.includes("큐브 연출 로딩 중");
  const failMsg = document.body.innerText.match(/큐브 연출 로드 실패: .+/);
  const statsText = document.body.innerText.match(/재생 \d+장/);
  return {
    emptyMsg,
    loadingMsg,
    failMsg: failMsg?.[0] ?? null,
    statsText: statsText?.[0] ?? null,
    mount: mount
      ? { w: mount.clientWidth, h: mount.clientHeight, cls: mount.className }
      : null,
    canvas: canvas ? { w: canvas.width, h: canvas.height, cssW: canvas.clientWidth } : null,
  };
});

console.log(JSON.stringify(probe, null, 2));
console.log("\n--- console (cube related) ---");
for (const line of logs.filter((l) => /cube|CubeView|presentation|WebGL|texture|fail/i.test(l)).slice(-30)) {
  console.log(line);
}

await page.screenshot({
  path: join(root, "experiments", "outputs", "debug_main_cube_tab.png"),
  fullPage: true,
});
console.log("\nscreenshot: experiments/outputs/debug_main_cube_tab.png");

await browser.close();
process.exit(probe.canvas && probe.canvas.w > 1 ? 0 : 1);
