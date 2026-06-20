import { chromium } from "playwright";

const url = process.argv[2] ?? "http://127.0.0.1:4173/showcase.html";
const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--ignore-gpu-blocklist", "--enable-webgl"],
});
const page = await browser.newPage();
await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120_000 });
await page.waitForTimeout(45_000);
const info = await page.evaluate(() => ({
  text: document.body.innerText.slice(0, 1200),
  buttons: [...document.querySelectorAll("button")].map((b) => ({
    t: b.textContent?.trim(),
    d: b.disabled,
    title: b.title,
  })),
  video: (() => {
    const v = document.querySelector("video.showcase-dom-backdrop");
    if (!(v instanceof HTMLVideoElement)) return null;
    return {
      vw: v.videoWidth,
      rs: v.readyState,
      src: v.currentSrc?.slice(0, 120),
    };
  })(),
}));
console.log(JSON.stringify(info, null, 2));
await browser.close();
