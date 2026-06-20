const { chromium } = require("playwright");
const path = require("node:path");
const fs = require("node:fs");

async function main() {
  const root = path.resolve(__dirname, "..");
  const sample = path.resolve(root, "PR_deck/brosher/assets/wedding/image1.png");
  if (!fs.existsSync(sample)) {
    throw new Error(`Sample image missing: ${sample}`);
  }

  const browser = await chromium.launch({
    headless: true,
    args: ["--use-gl=angle", "--ignore-gpu-blocklist", "--enable-webgl"],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    acceptDownloads: false,
  });
  const page = await context.newPage();

  const errors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      errors.push(msg.text());
    }
  });
  page.on("pageerror", (err) => errors.push(err.message));

  await page.goto("http://localhost:5173/wedding-simple/index.html", {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  const outDir = path.resolve(root, "experiments", "outputs");
  fs.mkdirSync(outDir, { recursive: true });
  await page.screenshot({ path: path.resolve(outDir, "wedding_simple_dev_00_home.png") });

  await page.locator('input[type="file"]').first().setInputFiles([sample, sample, sample]);
  await page.getByRole("button", { name: /AI 원클릭 자동 보정 시작/ }).click();

  // Wait until step 3 (3D viewport) becomes visible.
  // This can take minutes depending on local API and browser background removal.
  await page.waitForFunction(
    () => {
      const step3 = document.getElementById("step-3-view");
      return step3 && !step3.classList.contains("hidden");
    },
    undefined,
    { timeout: 480_000, polling: 1500 },
  );
  const phase = "step3";
  await page.waitForSelector("#canvas-container canvas", { timeout: 60_000 });
  await page.waitForTimeout(1500);

  const shotPath = path.resolve(outDir, `wedding_simple_dev_smoke_${phase}.png`);
  await page.screenshot({ path: shotPath, fullPage: false });

  const info = await page.evaluate(() => {
    const mount = document.querySelector("#canvas-container");
    const c = document.querySelector("#canvas-container canvas");
    const mr = mount?.getBoundingClientRect();
    const cr = c?.getBoundingClientRect();
    return {
      phaseText: document.body.innerText.slice(0, 120),
      mountW: mr?.width ?? 0,
      mountH: mr?.height ?? 0,
      canvasW: cr?.width ?? 0,
      canvasH: cr?.height ?? 0,
    };
  });

  console.log(JSON.stringify({ screenshot: shotPath, info, errors: errors.slice(0, 5) }, null, 2));

  await page.close();
  await context.close();
  await browser.close();

  if (errors.length) {
    throw new Error(`Browser errors: ${errors.slice(0, 3).join(" | ")}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});

