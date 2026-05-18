/**
 * Smoke-check local dev: API health + web loads without vault error.
 *   node scripts/verify-local-dev.mjs
 */
import { chromium } from "playwright";

const WEB_URL = process.env.WEB_URL ?? "http://localhost:5173";
const API_URL = process.env.API_URL ?? "http://localhost:8787";

let ok = true;

async function check(name, fn) {
  try {
    const detail = await fn();
    console.log(`[OK] ${name}${detail ? `: ${detail}` : ""}`);
    return true;
  } catch (error) {
    ok = false;
    console.log(`[FAIL] ${name}: ${error instanceof Error ? error.message : error}`);
    return false;
  }
}

const health = await fetch(`${API_URL}/health`);
await check("api /health", async () => {
  if (!health.ok) throw new Error(String(health.status));
  return await health.text();
});

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
try {
  await check("web loads", async () => {
    await page.goto(WEB_URL, { waitUntil: "domcontentloaded", timeout: 60_000 });
    return page.url();
  });

  await check("no vault load failure", async () => {
    await page.waitForTimeout(2000);
    const text = await page.locator("body").innerText();
    if (/서버 보관함 로드 실패|보관함 로드 실패/.test(text)) {
      throw new Error(text.slice(0, 200));
    }
    if (/클라우드 보관함 연결 실패/.test(text)) {
      throw new Error("cloud fallback triggered: " + text.slice(0, 180));
    }
    const match = text.match(/보관함을 불러왔습니다|이미지를 업로드/);
    return match?.[0] ?? "loaded";
  });

  await check("dev batch button visible", async () => {
    const btn = page.getByRole("button", { name: /data\/asset 배치 처리/ });
    if (!(await btn.isVisible({ timeout: 5_000 }))) {
      throw new Error("batch button missing");
    }
    return "visible";
  });
} finally {
  await browser.close();
}

process.exit(ok ? 0 : 1);
