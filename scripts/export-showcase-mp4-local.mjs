#!/usr/bin/env node
/**
 * Export showcase MP4 locally via Playwright + system Chrome (ANGLE GPU).
 * Does not require browser WebGL in your daily Chrome profile.
 *
 * Usage:
 *   node scripts/export-showcase-mp4-local.mjs
 *   node scripts/export-showcase-mp4-local.mjs "http://localhost:5173/showcase.html?localOnly=1"
 *   node scripts/export-showcase-mp4-local.mjs --photos img1.jpg img2.jpg img3.jpg
 *
 * Env:
 *   MBOX_WEB_URL     — showcase page (default: localhost:5173 localOnly)
 *   MBOX_OUT_DIR     — output folder relative to repo root (default: scripts/outputs)
 *   MBOX_GL          — angle | swiftshader (default: angle)
 *   MBOX_HEADED      — 1 to show browser window
 *   MBOX_ALLOW_IGPU  — 1 to allow Intel iGPU (default: require discrete GPU)
 */
import { existsSync, readFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import {
  assertDiscreteGpuOrExplain,
  ensureWindowsDiscreteGpuPreference,
  findChromeExecutable,
  resolveChromeDiscreteGpuArgs,
} from "./chrome-discrete-gpu.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const DEFAULT_URL =
  process.env.MBOX_WEB_URL?.trim() ||
  "http://localhost:5173/showcase.html?localOnly=1&fullGpu=1&look=rose_gold_premium&bg=solid_black&noPhysics=1";

function ensureFullGpuUrl(rawUrl) {
  try {
    const u = new URL(rawUrl);
    if (u.searchParams.get("fullGpu") !== "1") {
      u.searchParams.set("fullGpu", "1");
    }
    return u.toString();
  } catch {
    return rawUrl;
  }
}

function parseArgs(argv) {
  const photos = [];
  let url = process.env.MBOX_WEB_URL?.trim() || DEFAULT_URL;

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--photos" || arg === "-p") {
      while (i + 1 < argv.length && !argv[i + 1].startsWith("-")) {
        photos.push(argv[++i]);
      }
      continue;
    }
    if (arg.startsWith("http://") || arg.startsWith("https://")) {
      url = arg;
      continue;
    }
    if (/\.(jpe?g|png|webp)$/i.test(arg)) {
      photos.push(arg);
    }
  }

  return { url: ensureFullGpuUrl(url), photos };
}

function imageToDataUrl(filePath) {
  const abs = resolve(filePath);
  if (!existsSync(abs)) {
    throw new Error(`Photo not found: ${abs}`);
  }
  const base64 = readFileSync(abs).toString("base64");
  const mime = abs.toLowerCase().endsWith(".png")
    ? "image/png"
    : abs.toLowerCase().endsWith(".webp")
      ? "image/webp"
      : "image/jpeg";
  return `data:${mime};base64,${base64}`;
}

function resolveGlArgs() {
  return resolveChromeDiscreteGpuArgs();
}

const chromePath = findChromeExecutable();
if (chromePath) {
  ensureWindowsDiscreteGpuPreference(chromePath);
} else {
  console.warn("[warn] chrome.exe not found — install Google Chrome for local GPU export.");
}

const { url, photos } = parseArgs(process.argv);
const sourceUrls =
  photos.length > 0
    ? photos.map(imageToDataUrl)
    : process.env.MBOX_PHOTOS
      ? process.env.MBOX_PHOTOS.split(/[;,]/).map((p) => imageToDataUrl(p.trim()))
      : null;

const outDir = process.env.MBOX_OUT_DIR
  ? join(root, process.env.MBOX_OUT_DIR)
  : join(root, "scripts", "outputs");

await mkdir(outDir, { recursive: true });

console.log("URL:", url);
console.log("GL:", process.env.MBOX_GL ?? "angle");
if (sourceUrls?.length) {
  console.log("Photos:", photos.length || sourceUrls.length);
}

const browser = await chromium.launch({
  channel: "chrome",
  headless: process.env.MBOX_HEADED !== "1",
  args: resolveGlArgs(),
});
const context = await browser.newContext({ acceptDownloads: true });
await context.addInitScript(
  (payload) => {
    window.__MBOX_LOCAL_GPU_EXPORT__ = true;
    window.__MBOX_E2E_EXPORT__ = true;
    window.__MBOX_RENDER_BACKEND__ = "local";
    if (payload?.sourceUrls?.length) {
      window.__MBOX_RENDER_JOB_SOURCE_URLS__ = payload.sourceUrls;
    }
    if (payload?.exportSize) {
      window.__MBOX_EXPORT_SIZE__ = payload.exportSize;
    }
  },
  {
    sourceUrls: sourceUrls ?? [],
    exportSize: Number(process.env.MBOX_EXPORT_SIZE) || 0,
  }
);
const page = await context.newPage();

page.on("dialog", async (d) => {
  console.log("[dialog]", d.message());
  await d.dismiss();
});
page.on("console", (msg) => {
  const t = msg.text();
  if (/error|warn|WebGL|context|MP4|fail/i.test(t)) {
    console.log("[console]", msg.type(), t);
  }
});
page.on("pageerror", (err) => console.log("[pageerror]", String(err)));

await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120_000 });

const gpuProbe = await page.evaluate(() => {
  const canvas = document.createElement("canvas");
  const gl2 = canvas.getContext("webgl2");
  const gl = gl2 ?? canvas.getContext("webgl");
  if (!gl) {
    return { ok: false, webgl2: false, renderer: null };
  }
  const dbg = gl.getExtension("WEBGL_debug_renderer_info");
  const renderer = dbg
    ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)
    : "unknown";
  return { ok: true, webgl2: Boolean(gl2), renderer };
});

console.log("GPU probe:", gpuProbe);
if (!gpuProbe.ok) {
  await browser.close();
  throw new Error(
    "Local GPU WebGL unavailable in Chrome. Use MBOX_GL=angle (default) and ensure GPU drivers are enabled."
  );
}
const gpuCheck = assertDiscreteGpuOrExplain(gpuProbe.renderer);
if (!gpuCheck.ok) {
  await browser.close();
  throw new Error(gpuCheck.message);
}
if (/nvidia|geforce|gtx|rtx|4060/i.test(String(gpuProbe.renderer))) {
  console.log("Discrete GPU active:", gpuProbe.renderer);
}

await page.waitForFunction(
  () => {
    const report = window.__MBOX_SHOWCASE_RESOURCE_REPORT__;
    const jewelReady = report?.phases?.some((p) => p.phase === "jewel_spawn") ?? false;
    const btn = [...document.querySelectorAll("button")].find((b) =>
      /MP4/i.test(b.textContent ?? "")
    );
    return jewelReady && btn && !btn.disabled;
  },
  undefined,
  { timeout: 240_000 }
);

// Let reveal holo ramp + photo shaders settle before 2160² encode.
await page.waitForTimeout(8_000);

await page.waitForFunction(
  () => {
    const btn = [...document.querySelectorAll("button")].find((b) =>
      /MP4/i.test(b.textContent ?? "")
    );
    return Boolean(btn && !btn.disabled);
  },
  undefined,
  { timeout: 180_000 }
);

console.log("Clicking MP4...");
const downloadPromise = page.waitForEvent("download", { timeout: 300_000 });
await page.getByRole("button", { name: /MP4/i }).click({ timeout: 60_000 });

const download = await downloadPromise;
const suggested = download.suggestedFilename() || "mbox-showcase.mp4";
const stamped = suggested.replace(/\.mp4$/i, `-${Date.now()}.mp4`);
const outPath = join(outDir, stamped);
await download.saveAs(outPath);

const bytes = existsSync(outPath) ? readFileSync(outPath).length : 0;
console.log("Saved:", outPath.replace(/\\/g, "/"), `(${bytes} bytes)`);
await browser.close();
