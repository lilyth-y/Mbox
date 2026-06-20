/**
 * E2E: main app upload → process → cube tab
 *   npx tsx scripts/debug-main-cube-e2e.mjs
 */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sample = join(root, "wedding_2d_input.jpg");

if (!existsSync(sample)) {
  console.error("Missing sample:", sample);
  process.exit(1);
}

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--ignore-gpu-blocklist", "--enable-webgl"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
const logs = [];
page.on("console", (m) => logs.push(`${m.type()}: ${m.text()}`));
page.on("pageerror", (e) => logs.push(`pageerror: ${e.message}`));

await page.goto("http://localhost:5173/", { waitUntil: "networkidle", timeout: 120_000 });
await page.locator('input[type="file"]').setInputFiles(sample);
await page.getByRole("button", { name: /분석·크롭 시작/ }).click();
await page.waitForFunction(
  () =>
    document.body.innerText.includes("분석·크롭이 완료") ||
    /완료/.test(document.body.innerText),
  undefined,
  { timeout: 300_000 },
);

const vaultText = await page.evaluate(
  () => document.body.innerText.match(/보관함\s*(\d+)장/)?.[0] ?? null,
);

await page.getByRole("button", { name: /3D 큐브/ }).click();
await page.waitForTimeout(6000);

const probe = await page.evaluate(() => ({
  empty: document.body.innerText.includes("큐브를 보려면 사진이 필요합니다"),
  loading: document.body.innerText.includes("큐브 연출 로딩 중"),
  fail: document.body.innerText.match(/큐브 연출 로드 실패: .+/)?.[0] ?? null,
  stats: document.body.innerText.match(/재생\s*\d+장/)?.[0] ?? null,
  vis:
    document.body.innerText.includes("3D VISUALIZATION") ||
    document.body.innerText.includes("3D HOLOGRAM FAN"),
  canvas: document.querySelector("canvas")
    ? {
        w: document.querySelector("canvas").width,
        h: document.querySelector("canvas").height,
      }
    : null,
}));

console.log(JSON.stringify({ vaultText, probe }, null, 2));
console.log(
  logs
    .filter((l) => /cube|CubeView|fail|error|texture|presentation/i.test(l))
    .slice(-20)
    .join("\n"),
);

await browser.close();
process.exit(probe.canvas?.w > 1 ? 0 : 1);
