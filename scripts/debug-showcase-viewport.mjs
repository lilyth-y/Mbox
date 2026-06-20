import { chromium } from "playwright";

const url = process.argv[2] ?? "http://127.0.0.1:5173/showcase.html?shape=sphere";
const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--ignore-gpu-blocklist", "--enable-webgl"],
});
const page = await browser.newPage();
const logs = [];
page.on("console", (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on("pageerror", (e) => logs.push(`[pageerror] ${e}`));

await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120_000 });
await page.waitForTimeout(50_000);

const info = await page.evaluate(() => {
  const canvas = document.querySelector("canvas");
  const gl = canvas?.getContext("webgl2") || canvas?.getContext("webgl");
  const samples = [];
  if (gl && canvas) {
    for (const [x, y] of [
      [160, 160],
      [320, 320],
      [480, 480],
    ]) {
      const p = new Uint8Array(4);
      gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, p);
      samples.push({ x, y, r: p[0], g: p[1], b: p[2] });
    }
  }
  const video = document.querySelector("video.showcase-dom-backdrop");
  return {
    text: document.body.innerText.match(/[^\n]{10,120}/g)?.slice(0, 12) ?? [],
    backdropError: document.querySelector(".showcase-dom-backdrop-error")?.textContent?.trim() ?? null,
    video: video
      ? {
          vw: video.videoWidth,
          rs: video.readyState,
          src: video.currentSrc?.slice(-80),
        }
      : null,
    samples,
    loading: !!document.querySelector(".animate-spin"),
  };
});

await page.screenshot({ path: "c:/startingup/Mbox/.cursor/debug-showcase-viewport.png", fullPage: false });
console.log(JSON.stringify({ info, logs: logs.slice(0, 20) }, null, 2));
await browser.close();
