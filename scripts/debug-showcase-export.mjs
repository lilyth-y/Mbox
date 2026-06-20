import { chromium } from "playwright";

const url =
  process.argv[2] ??
  "https://storage.googleapis.com/mbox-web-newmedia-496107/showcase.html";

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--ignore-gpu-blocklist", "--enable-webgl"],
});
const context = await browser.newContext({ acceptDownloads: true });
await context.addInitScript(() => {
  window.__MBOX_E2E_EXPORT__ = true;
});
const page = await context.newPage();
page.on("dialog", async (d) => {
  console.log("DIALOG:", d.message());
  await d.dismiss();
});

await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120_000 });
await page.waitForFunction(
  () => {
    const btn = [...document.querySelectorAll("button")].find((b) =>
      /MP4/i.test(b.textContent ?? "")
    );
    return btn && !btn.disabled;
  },
  undefined,
  { timeout: 120_000 }
);

console.log("Clicking MP4...");
const downloadPromise = page
  .waitForEvent("download", { timeout: 300_000 })
  .then((d) => ({ type: "download", name: d.suggestedFilename() }));

await page.getByRole("button", { name: /MP4/i }).click();

for (let i = 0; i < 60; i++) {
  await page.waitForTimeout(5_000);
  const snap = await page.evaluate(() => ({
    exportMsg: [...document.body.querySelectorAll("*")]
      .map((el) => el.textContent ?? "")
      .find((t) => /MP4|다운로드|녹화|실패|배경/i.test(t) && t.length < 120),
    payload: window.__MBOX_LAST_SHOWCASE_EXPORT__,
    cubePayload: window.__MBOX_LAST_EXPORT__,
    recordingBtn: [...document.querySelectorAll("button")]
      .filter((b) => /MP4/i.test(b.textContent ?? ""))
      .map((b) => ({ t: b.textContent?.trim(), d: b.disabled })),
  }));
  console.log(`t=${(i + 1) * 5}s`, JSON.stringify(snap));
  if (snap.payload || snap.cubePayload) break;
}

try {
  const result = await Promise.race([
    downloadPromise,
    page.waitForTimeout(1).then(() => null),
  ]);
  if (result) console.log("GOT", result);
} catch (e) {
  console.error("download err", e);
}

await browser.close();
