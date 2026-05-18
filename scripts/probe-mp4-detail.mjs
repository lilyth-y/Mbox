import { chromium } from "playwright";

const WEB_URL = process.env.WEB_URL ?? "http://127.0.0.1:5174";
const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--ignore-gpu-blocklist", "--enable-webgl"],
});
const context = await browser.newContext({ acceptDownloads: true });
const page = await context.newPage();
const errors = [];
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
page.on("pageerror", (e) => errors.push(String(e)));

await page.goto(WEB_URL, { waitUntil: "domcontentloaded" });
await page.getByRole("button", { name: /data\/asset 배치/ }).click();
await page.waitForFunction(
  () => document.body.innerText.includes("배치 처리가 완료"),
  undefined,
  { timeout: 600_000 },
);
await page.getByRole("button", { name: /3D 큐브/ }).click();
await page.getByText("재생 20장").waitFor({ timeout: 60_000 });
await page.getByRole("button", { name: /연출 적용/ }).first().click();

const btn = page.getByRole("button", { name: /MP4 생성/ }).first();
console.log("disabled before", await btn.isDisabled());
await btn.click();
await page.waitForTimeout(3000);
console.log("disabled after 3s", await btn.isDisabled());
console.log("slate 3s", await page.locator("p.text-slate-400").allTextContents());
await page.waitForTimeout(125_000);
console.log("slate 128s", await page.locator("p.text-slate-400").allTextContents());
console.log("errors", errors.slice(0, 10));
await browser.close();
