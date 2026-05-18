import { chromium } from "playwright";

const WEB_URL = process.env.WEB_URL ?? "http://127.0.0.1:5174";
const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--ignore-gpu-blocklist", "--enable-webgl"],
});
const context = await browser.newContext({ acceptDownloads: true });
const page = await context.newPage();

await page.goto(WEB_URL, { waitUntil: "domcontentloaded" });
await page.getByRole("button", { name: /data\/asset 배치/ }).click();
await page.waitForFunction(
  () => document.body.innerText.includes("data/asset 배치 처리가 완료"),
  undefined,
  { timeout: 600_000 },
);
await page.getByRole("button", { name: /3D 큐브/ }).click();
await page.getByText("재생 20장").waitFor({ timeout: 60_000 });
await page.getByRole("button", { name: /연출 적용/ }).first().click();

await page.getByRole("button", { name: /MP4 생성/ }).first().click();
for (const sec of [30, 60, 90, 120, 150]) {
  await page.waitForTimeout(30_000);
  const t = await page.locator("body").innerText();
  const line =
    t.split("\n").find((l) => /MP4|WebM|영상|실패|준비|생성/.test(l)) ?? "(no status)";
  console.log(`+${sec}s: ${line}`);
}

await browser.close();
