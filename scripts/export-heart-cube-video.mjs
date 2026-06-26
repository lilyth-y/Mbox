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
import { existsSync, readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const DEFAULT_PHOTOS = [
  join(root, "data/wedding-sample/wedding_couple_02.jpg"),
  join(root, "data/wedding-sample/wedding_bride_03.jpg"),
];

const DEFAULT_LUXURY_BACKDROP =
  process.env.MBOX_LUXURY_BACKDROP?.trim() || "luxury/0_Gold_Golden_3840x2160.mp4";

const DEFAULT_SHOWCASE_URL =
  process.env.MBOX_WEB_URL?.trim() ||
  process.env.MBOX_SHOWCASE_URL?.trim() ||
  "http://localhost:4173/showcase.html";

const OUT_DIR = process.env.MBOX_OUT_DIR
  ? join(root, process.env.MBOX_OUT_DIR)
  : join(root, "scripts", "outputs");
const DEFAULT_BGM_PATH =
  process.env.MBOX_BGM_PATH?.trim() || join(root, "apps/web/public/bgm/romantic-wedding.mp3");

const RECORD_TIMEOUT_MS = Number(process.env.MBOX_RECORD_TIMEOUT_MS ?? 900_000);
const EXPORT_SIZE = Number(process.env.MBOX_EXPORT_SIZE ?? 720);
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
  url.searchParams.set("bg", "booth");
  url.searchParams.set("backdrop", DEFAULT_LUXURY_BACKDROP);
  url.searchParams.set("noPhysics", "1");
  url.searchParams.set("shape", shapeId);
  return url.toString();
}

function ffprobeFrameCount(file) {
  const result = spawnSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-count_frames",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=nb_read_frames,r_frame_rate,avg_frame_rate",
      "-of",
      "json",
      file,
    ],
    { encoding: "utf8" }
  );
  if (result.status !== 0) return null;
  try {
    const parsed = JSON.parse(result.stdout);
    const stream = parsed.streams?.[0];
    const frames = Number.parseInt(stream?.nb_read_frames ?? "0", 10);
    const duration = ffprobeDuration(file);
    return { frames, duration, rFrameRate: stream?.r_frame_rate, avgFrameRate: stream?.avg_frame_rate };
  } catch {
    return null;
  }
}

function assertSmoothVideo(file, minFps = 20) {
  const info = ffprobeFrameCount(file);
  if (!info?.duration || !info.frames) {
    throw new Error(`Could not verify frame cadence for ${file}`);
  }
  const fps = info.frames / info.duration;
  if (fps < minFps) {
    throw new Error(
      `Export too choppy: ${fps.toFixed(1)} fps (${info.frames} frames / ${info.duration.toFixed(1)}s)`
    );
  }
  console.log(`Verified cadence: ${fps.toFixed(1)} fps (${info.frames} frames)`);
}

function normalizePhotoForShowcase(inputPath) {
  const tmpDir = mkdtempSync(join(tmpdir(), "mbox-photo-"));
  const outPath = join(tmpDir, "normalized.jpg");
  const result = spawnSync(
    "ffmpeg",
    [
      "-y",
      "-i",
      inputPath,
      "-vf",
      "scale=1024:1024:force_original_aspect_ratio=increase,crop=1024:1024",
      "-q:v",
      "2",
      outPath,
    ],
    { encoding: "utf8" }
  );
  if (result.status !== 0 || !existsSync(outPath)) {
    throw new Error(`Failed to normalize photo ${inputPath}:\n${result.stderr}`);
  }
  return outPath;
}

function preparePhotoPaths(photoPaths) {
  return photoPaths.map((photoPath) => normalizePhotoForShowcase(photoPath));
}

async function waitForExportReady(page, shapeId) {
  await page.evaluate(async () => {
    const video = document.querySelector(
      ".showcase-viewport-wrap video.showcase-dom-backdrop"
    );
    if (video instanceof HTMLVideoElement) {
      video.muted = true;
      try {
        await video.play();
      } catch {
        /* autoplay may already be running */
      }
    }
  });

  await page.waitForFunction(
    () => {
      const btn = [...document.querySelectorAll("button")].find((b) => /MP4/i.test(b.textContent ?? ""));
      return Boolean(btn && !btn.disabled);
    },
    undefined,
    { timeout: RECORD_TIMEOUT_MS }
  );

  const backdropLuma = await page.evaluate(() => {
    const video = document.querySelector(
      ".showcase-viewport-wrap video.showcase-dom-backdrop"
    );
    if (!(video instanceof HTMLVideoElement) || video.videoWidth <= 0) return null;
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, 64, 64);
    const data = ctx.getImageData(0, 0, 64, 64).data;
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) {
      sum += data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722;
    }
    return sum / (data.length / 4);
  });
  console.log(`[${shapeId}] export ready · backdrop luma=${backdropLuma?.toFixed(1) ?? "n/a"}`);
}

function compositeLuxuryBackdrop(videoPath, backdropPath, outPath) {
  const duration = ffprobeDuration(videoPath) ?? 30;
  const result = spawnSync(
    "ffmpeg",
    [
      "-y",
      "-stream_loop",
      "-1",
      "-i",
      backdropPath,
      "-i",
      videoPath,
      "-filter_complex",
      `[0:v]scale=720:720:force_original_aspect_ratio=increase,crop=720:720,trim=duration=${duration.toFixed(3)},setpts=PTS-STARTPTS[bg];` +
        `[1:v]fps=30,format=rgba,` +
        `geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':` +
        `a='if(lt(0.2126*r(X,Y)+0.7152*g(X,Y)+0.0722*b(X,Y),10),0,255)'[fg];` +
        `[bg][fg]overlay=0:0:format=auto[out]`,
      "-map",
      "[out]",
      "-map",
      "1:a?",
      "-c:v",
      "libx264",
      "-preset",
      "fast",
      "-crf",
      "20",
      "-c:a",
      "copy",
      "-t",
      String(duration),
      outPath,
    ],
    { encoding: "utf8" }
  );
  if (result.status !== 0) {
    throw new Error(`ffmpeg backdrop composite failed:\n${result.stderr}`);
  }
  return outPath;
}

function smoothVideoFps(videoPath, outPath, targetFps = 30) {
  const duration = ffprobeDuration(videoPath) ?? 30;
  const info = ffprobeFrameCount(videoPath);
  const sourceFps = info?.duration && info.frames ? info.frames / info.duration : 0;
  const filter =
    sourceFps > 0 && sourceFps < targetFps * 0.6
      ? `fps=${targetFps}`
      : `minterpolate=fps=${targetFps}:mi_mode=mci:mc_mode=aobmc:vsbmc=1`;
  const result = spawnSync(
    "ffmpeg",
    [
      "-y",
      "-i",
      videoPath,
      "-vf",
      filter,
      "-c:v",
      "libx264",
      "-preset",
      "fast",
      "-crf",
      "20",
      "-c:a",
      "copy",
      "-t",
      String(duration),
      outPath,
    ],
    { encoding: "utf8" }
  );
  if (result.status !== 0) {
    throw new Error(`ffmpeg fps smooth failed:\n${result.stderr}`);
  }
  return outPath;
}

function sampleVideoCornerLuma(file) {
  const tmp = join(tmpdir(), `mbox-luma-${Date.now()}.raw`);
  const result = spawnSync(
    "ffmpeg",
    [
      "-y",
      "-i",
      file,
      "-ss",
      "4",
      "-vf",
      "crop=48:48:0:0,format=gray",
      "-frames:v",
      "1",
      "-f",
      "rawvideo",
      tmp,
    ],
    { encoding: "utf8" }
  );
  if (result.status !== 0 || !existsSync(tmp)) {
    return null;
  }
  const data = readFileSync(tmp);
  spawnSync("rm", ["-f", tmp]);
  if (data.length === 0) return null;
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    sum += data[i];
  }
  return sum / data.length;
}

function resolveLuxuryBackdropFile() {
  if (DEFAULT_LUXURY_BACKDROP.startsWith("http://") || DEFAULT_LUXURY_BACKDROP.startsWith("https://")) {
    return DEFAULT_LUXURY_BACKDROP;
  }
  return join(root, "data/background", DEFAULT_LUXURY_BACKDROP);
}

function muxBgmWithFfmpeg(videoPath, bgmPath, outPath, volume = 0.78) {
  const duration = ffprobeDuration(videoPath);
  const fadeOutStart = duration ? Math.max(0, duration - 3) : 0;
  const result = spawnSync(
    "ffmpeg",
    [
      "-y",
      "-i",
      videoPath,
      "-i",
      bgmPath,
      "-filter_complex",
      `[1:a]volume=${volume},afade=t=in:st=0:d=2,afade=t=out:st=${fadeOutStart.toFixed(2)}:d=3[a]`,
      "-map",
      "0:v:0",
      "-map",
      "[a]",
      "-c:v",
      "copy",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-shortest",
      outPath,
    ],
    { encoding: "utf8" }
  );
  if (result.status !== 0) {
    throw new Error(`ffmpeg BGM mux failed:\n${result.stderr}`);
  }
  return outPath;
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
      window.__MBOX_FAST_EXPORT__ = true;
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

  await waitForExportReady(page, shapeId);

  await page.waitForTimeout(6_000);

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
  const photoPaths = preparePhotoPaths(parsePhotos(process.argv));
  await mkdir(OUT_DIR, { recursive: true });

  console.log("Photos:", photoPaths.map((p) => p.replace(/\\/g, "/")).join(", "));
  console.log("Luxury backdrop:", DEFAULT_LUXURY_BACKDROP);
  console.log("BGM:", DEFAULT_BGM_PATH.replace(/\\/g, "/"));
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
  const finalPath = join(OUT_DIR, `mbox-wedding-luxury-heart-cube-${Date.now()}.mp4`);
  const silentPath = join(OUT_DIR, `mbox-wedding-luxury-heart-cube-silent-${Date.now()}.mp4`);

  try {
    const cube = await exportShape(browser, "cube", photoPaths, cubePath);
    const heart = await exportShape(browser, "heart", photoPaths, heartPath);
    await browser.close();

    concatMp4([cubePath, heartPath], silentPath);

    const backdropFile = resolveLuxuryBackdropFile();
    const cornerLuma = sampleVideoCornerLuma(silentPath);
    const hasBakedBackdrop = cornerLuma !== null && cornerLuma > 28;
    console.log(`Silent video corner luma=${cornerLuma?.toFixed(1) ?? "n/a"} (baked backdrop=${hasBakedBackdrop})`);

    let compositedPath = silentPath;
    if (!hasBakedBackdrop) {
      compositedPath = join(OUT_DIR, `mbox-wedding-luxury-composited-${Date.now()}.mp4`);
      compositeLuxuryBackdrop(silentPath, backdropFile, compositedPath);
    } else {
      const smoothedPath = join(OUT_DIR, `mbox-wedding-luxury-smoothed-${Date.now()}.mp4`);
      smoothVideoFps(silentPath, smoothedPath);
      compositedPath = smoothedPath;
    }

    if (!existsSync(DEFAULT_BGM_PATH)) {
      throw new Error(`BGM not found: ${DEFAULT_BGM_PATH} — run npm run download:commercial-bgm`);
    }
    muxBgmWithFfmpeg(compositedPath, DEFAULT_BGM_PATH, finalPath);
    assertSmoothVideo(finalPath);
    const finalDuration = ffprobeDuration(finalPath);
    const finalWxH = ffprobeWxH(finalPath);
    const finalBytes = readFileSync(finalPath).length;

    const manifest = {
      createdAt: new Date().toISOString(),
      style: "wedding_luxury_rose_gold",
      photos: photoPaths,
      luxuryBackdrop: DEFAULT_LUXURY_BACKDROP,
      bgm: DEFAULT_BGM_PATH,
      exportSize: EXPORT_SIZE,
      glMode: GL_MODE,
      segments: [cube, heart],
      silentVideo: silentPath,
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

    const friendlyPath = join(OUT_DIR, "mbox-wedding-luxury-heart-cube.mp4");
    writeFileSync(friendlyPath, readFileSync(finalPath));
    const workspaceCopy = join(root, "mbox-wedding-luxury-heart-cube.mp4");
    writeFileSync(workspaceCopy, readFileSync(finalPath));

    console.log("\n=== Wedding luxury video (cube + heart + BGM) ===");
    console.log("Output:", finalPath.replace(/\\/g, "/"));
    console.log("Download:", workspaceCopy.replace(/\\/g, "/"));
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
