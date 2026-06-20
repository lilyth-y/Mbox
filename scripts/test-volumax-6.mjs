import { existsSync, mkdirSync, statSync, writeFileSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "experiments", "outputs");
const sessionDir = join(outDir, "volumax_6_images_test");
mkdirSync(sessionDir, { recursive: true });

const WEB_URL = "http://localhost:5173/wedding-simple/index.html";

async function run() {
  let browser;
  let context;
  let page;
  try {
    browser = await chromium.launch({
      headless: true, // run headless, but record video
      args: ["--use-gl=angle", "--ignore-gpu-blocklist", "--enable-webgl"],
    });

    context = await browser.newContext({
      viewport: { width: 1440, height: 960 },
      recordVideo: { dir: sessionDir, size: { width: 1440, height: 960 } }
    });
    
    page = await context.newPage();
    console.log(`Navigate to ${WEB_URL}`);
    await page.goto(WEB_URL, { waitUntil: "networkidle", timeout: 120000 });

    const fileInput = page.locator('input[type="file"]');
    
    const assetDir = "c:\\startingup\\Mbox\\data\\asset\\temp_1778692001076.-1818431043";
    const filesToUpload = [
      "KakaoTalk_20260505_131306132_01.jpg",
      "KakaoTalk_20260505_131306132_02.jpg",
      "KakaoTalk_20260505_131306132_03.jpg",
      "KakaoTalk_20260505_131306132_04.jpg",
      "KakaoTalk_20260505_131306132_05.jpg",
      "KakaoTalk_20260505_131306132_06.jpg"
    ].map(name => join(assetDir, name));

    console.log(`Uploading 6 files...`);
    await fileInput.setInputFiles(filesToUpload);
    await page.waitForTimeout(2000);

    const startBtn = page.locator("#start-ai-btn");
    console.log("Clicking start button...");
    await startBtn.click();
    
    console.log("Waiting for AI processing completion...");
    await page.waitForFunction(
      () => {
        const step3 = document.getElementById("step-3-view");
        return step3 && !step3.classList.contains("hidden");
      },
      undefined,
      { timeout: 300000 }
    );
    
    console.log("AI processing finished. Recording presentation for 25 seconds...");
    // Let it play for 25 seconds to capture a few cube turns and the 1 RPS / 5 RPS speeds.
    await page.waitForTimeout(25000);

    console.log("Closing page to save video...");
    await page.close();
    page = null;
    
    // The video should be saved now in sessionDir. Find it.
  } catch (error) {
    console.error(`FAIL: ${error.message}`);
  } finally {
    if (page) await page.close().catch(() => {});
    if (context) await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
  }
}

run().then(() => console.log("Done"));
