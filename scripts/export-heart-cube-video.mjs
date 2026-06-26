#!/usr/bin/env node
/**
 * Export a combined Crystal Showcase MP4 featuring cube and heart shapes.
 *
 * Usage:
 *   node scripts/export-heart-cube-video.mjs
 *   node scripts/export-heart-cube-video.mjs --photos img1.jpg img2.jpg
 *
 * Env:
 *   MBOX_WEB_URL          — showcase base (default localhost:5173)
 *   MBOX_OUT_DIR          — output folder (default scripts/outputs)
 *   MBOX_EXPORT_SIZE      — square export size (default 1080)
 *   MBOX_RECORD_TIMEOUT_MS — per-shape export wait (default 600000)
 *   MBOX_GL               — swiftshader | angle (default swiftshader for CI/cloud)
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const DEFAULT_PHOTOS = [
  join(root, "data/showcase-qa-corpus/qa_005_portrait.jpg"),
  join(root, "data/showcase-qa-corpus/qa_021_landscape.jpg"),
  join(root, "data/showcase-qa-corpus/qa_012_square.jpg"),
];

const DEFAULT_SHOWCASE_URL =
  "https://storage.googleapis.com/mbox-web-newmedia-496107/showcase.html";

const OUT_DIR = process.env.MBOX_OUT_DIR
  ? join(root, process.env.MBOX_OUT_DIR)
  : join(root, "scripts", "outputs");
const RECORD_TIMEOUT_MS = Number(process.env.MBOX_RECORD_TIMEOUT_MS ?? 600_000);
const EXPORT_SIZE = Number(process.env.MBOX_EXPORT_SIZE ?? 1080);
const GL_MODE = String(process.env.MBOX_GL ?? "swiftshader").trim().toLowerCase();

function parsePhotos(argv) {
  const photos = [];
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--photos" || arg === "-p") {
      while (i + 1 < argv.length && !argv[i + 1].startsWith("-")) {
        photos.push(argv[++i]);
      }
      continue;
    }
    if (/\.(jpe?g|png|webp)$/i.test(arg)) {
      photos.push(arg);
    }
  }
  return photos.length > 0 ? photos : DEFAULT_PHOTOS;
}

function resolveShowcasePageUrl() {
  const raw =
    process.env.MBOX_WEB_URL?.trim() ||
    process.env.MBOX_SHOWCASE_URL?.trim() ||
    DEFAULT_SHOWCASE_URL;
  const url = new URL(raw.includes("://") ? raw : `http://${raw}`);
  if (!url.pathname.endsWith(".html")) {
    url.pathname = `${url.pathname.replace(/\/?$/, "")}/showcase.html`;
  }
  return url;
}

function buildShowcaseUrl(shapeId) {
  const url = resolveShowcasePageUrl();
  url.search = "";
  url.hash = "";
  url.searchParams.set("look", "rose_gold_premium");
  url.searchParams.set("bg", "solid_black");
  url.searchParams.set("noPhysics", "1");
  url.searchParams.set("shape", shapeId);
  return url.toString();
}

function ffprobeDuration(file) {
  const result = spawnSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      file,
    ],
    { encoding: "utf8" }
  );
  if (result.status !== 0) return null;
  const value = Number.parseFloat(result.stdout.trim());
  return Number.isFinite(value) ? value : null;
}

function ffprobeWxH(file) {
  const result = spawnSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height",
      "-of",
      "csv=p=0:s=x",
      file,
    ],
    { encoding: "utf8" }
  );
  if (result.status !== 0) return null;
  const [width, height] = result.stdout.trim().split("x").map((v) => Number.parseInt(v, 10));
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  return { width, height };
}

async function exportShape(browser, shapeId, photoPaths, outPath) {
  const context = await browser.newContext({ acceptDownloads: true });
  await context.addInitScript(
    (payload) => {
      window.__MBOX_E2E_EXPORT__ = true;
      window.__MBOX_RENDER_BACKEND__ = "local";
      window.__MBOX_EXPORT_SIZE__ = payload.exportSize;
    },
    { exportSize: EXPORT_SIZE }
  );

  const page = await context.newPage();
  page.on("console", (msg) => {
    const text = msg.text();
    if (/error|warn|WebGL|MP4|fail/i.test(text)) {
      console.log(`[${shapeId}]`, msg.type(), text);
    }
  });
  page.on("pageerror", (err) => console.log(`[${shapeId}] pageerror`, String(err)));

  const url = buildShowcaseUrl(shapeId);
  console.log(`\n=== Export ${shapeId} ===`);
  console.log("URL:", url);

  const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120_000 });
  if (!response?.ok()) {
    throw new Error(`${shapeId}: showcase load failed (${response?.status()})`);
  }

  const gpuProbe = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    if (!gl) return { ok: false, renderer: null };
    const dbg = gl.getExtension("WEBGL_debug_renderer_info");
    const renderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : "unknown";
    return { ok: true, renderer };
  });
  console.log(`[${shapeId}] GPU:`, gpuProbe.renderer ?? "unavailable");
  if (!gpuProbe.ok) {
    throw new Error(`${shapeId}: WebGL unavailable`);
  }

  const uploadInput = page.locator('[data-testid="showcase-photo-upload"]');
  await uploadInput.waitFor({ state: "attached", timeout: 60_000 });
  await uploadInput.setInputFiles(photoPaths);

  await page.waitForFunction(
    () => {
      const btn = [...document.querySelectorAll("button")].find((b) => /MP4/i.test(b.textContent ?? ""));
      return Boolean(btn && !btn.disabled);
    },
    undefined,
    { timeout: RECORD_TIMEOUT_MS }
  );

  await page.waitForTimeout(4_000);

  const downloadPromise = page.waitForEvent("download", { timeout: RECORD_TIMEOUT_MS });
  await page.getByRole("button", { name: /MP4/i }).click({ timeout: 60_000 });
  const download = await downloadPromise;
  await download.saveAs(outPath);
  await context.close();

  const bytes = existsSync(outPath) ? readFileSync(outPath).length : 0;
  const duration = ffprobeDuration(outPath);
  const wxh = ffprobeWxH(outPath);
  console.log(
    `[${shapeId}] saved ${outPath.replace(/\\/g, "/")} (${bytes} bytes, ${duration?.toFixed(1) ?? "?"}s, ${wxh?.width ?? "?"}x${wxh?.height ?? "?"})`
  );
  if (bytes < 80_000) {
    throw new Error(`${shapeId}: export too small (${bytes} bytes)`);
  }
  return { shapeId, outPath, bytes, durationSec: duration, ...wxh };
}

function concatMp4(segments, outPath) {
  const listPath = join(dirname(outPath), "concat-list.txt");
  const listBody = segments.map((file) => `file '${file.replace(/'/g, "'\\''")}'`).join("\n");
  writeFileSync(listPath, listBody, "utf8");

  const result = spawnSync(
    "ffmpeg",
    ["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", outPath],
    { encoding: "utf8" }
  );
  if (result.status !== 0) {
    throw new Error(`ffmpeg concat failed:\n${result.stderr}`);
  }
  return outPath;
}

async function main() {
  const photoPaths = parsePhotos(process.argv);
  await mkdir(OUT_DIR, { recursive: true });

  console.log("Photos:", photoPaths.map((p) => p.replace(/\\/g, "/")).join(", "));
  console.log("Export size:", EXPORT_SIZE);
  console.log("GL mode:", GL_MODE);

  const browser = await chromium.launch({
    headless: process.env.MBOX_HEADED !== "1",
    args: [
      `--use-gl=${GL_MODE === "angle" ? "angle" : "swiftshader"}`,
      "--ignore-gpu-blocklist",
      "--enable-webgl",
      "--disable-gpu-sandbox",
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding",
      "--disable-dev-shm-usage",
      "--autoplay-policy=no-user-gesture-required",
    ],
  });

  const tempDir = await mkdtemp(join(tmpdir(), "mbox-heart-cube-"));
  const cubePath = join(tempDir, "cube.mp4");
  const heartPath = join(tempDir, "heart.mp4");
  const finalPath = join(OUT_DIR, `mbox-heart-cube-${Date.now()}.mp4`);

  try {
    const cube = await exportShape(browser, "cube", photoPaths, cubePath);
    const heart = await exportShape(browser, "heart", photoPaths, heartPath);
    await browser.close();

    concatMp4([cubePath, heartPath], finalPath);
    const finalDuration = ffprobeDuration(finalPath);
    const finalWxH = ffprobeWxH(finalPath);
    const finalBytes = readFileSync(finalPath).length;

    const manifest = {
      createdAt: new Date().toISOString(),
      photos: photoPaths,
      exportSize: EXPORT_SIZE,
      glMode: GL_MODE,
      segments: [cube, heart],
      output: {
        path: finalPath,
        bytes: finalBytes,
        durationSec: finalDuration,
        width: finalWxH?.width,
        height: finalWxH?.height,
      },
    };
    const manifestPath = finalPath.replace(/\.mp4$/i, ".json");
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

    console.log("\n=== Combined video ===");
    console.log("Output:", finalPath.replace(/\\/g, "/"));
    console.log(
      `Duration: ${finalDuration?.toFixed(1) ?? "?"}s | Size: ${(finalBytes / 1_024 / 1_024).toFixed(1)} MB | ${finalWxH?.width}x${finalWxH?.height}`
    );
    console.log("Manifest:", manifestPath.replace(/\\/g, "/"));
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
