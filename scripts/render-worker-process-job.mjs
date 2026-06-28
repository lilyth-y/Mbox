#!/usr/bin/env node
/**
 * Process a single cloud render job via headless Chromium.
 *
 * Usage: node scripts/render-worker-process-job.mjs <jobId>
 */
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { loadEnvLocal } from "./lib/load-env-local.mjs";
import { uploadRenderOutputToGcs } from "./lib/upload-render-output-gcs.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
loadEnvLocal(root);

const jobId = process.argv[2] ?? process.env.MBOX_RENDER_JOB_ID;
if (!jobId) {
  console.error("Usage: node scripts/render-worker-process-job.mjs <jobId>");
  process.exit(1);
}

const API_URL = (process.env.VITE_API_BASE_URL ?? "http://localhost:8787").replace(/\/$/, "");
const WEB_BASE = (process.env.MBOX_WEB_BASE_URL ?? "http://localhost:5173").replace(/\/$/, "");
const API_KEY = process.env.API_KEY ?? process.env.VITE_API_KEY ?? "";
const RECORD_TIMEOUT_MS = Number(process.env.MBOX_RECORD_TIMEOUT_MS ?? 300_000);
const DEFAULT_CRYSTAL_BACKDROP =
  process.env.MBOX_CRYSTAL_BACKDROP ?? "배경동영상/mf001.mp4";

const testImages = [
  process.env.MBOX_TEST_IMAGE ?? join(root, "data/showcase-qa-corpus/qa_005_portrait.jpg"),
  join(root, "data/showcase-qa-corpus/qa_021_landscape.jpg"),
  join(root, "data/showcase-qa-corpus/qa_012_square.jpg"),
];

function resolveGlMode() {
  const v = String(process.env.MBOX_GL ?? "").trim().toLowerCase();
  if (v === "angle" || v === "swiftshader") return v;
  // Headless CI: SwiftShader avoids ANGLE context-loss on software stacks.
  if (process.env.MBOX_HEADED !== "1") {
    return "swiftshader";
  }
  return "angle";
}

const glMode = resolveGlMode();
const CHROMIUM_ARGS = [
  `--use-gl=${glMode}`,
  "--ignore-gpu-blocklist",
  "--enable-webgl",
  "--disable-gpu-sandbox",
  "--disable-background-timer-throttling",
  "--disable-renderer-backgrounding",
  "--disable-dev-shm-usage",
  "--autoplay-policy=no-user-gesture-required",
];

function buildHeaders(extra = {}) {
  const headers = {
    "Content-Type": "application/json",
    "X-Workspace-Id": "default",
    ...extra,
  };
  if (API_KEY) {
    headers["X-API-Key"] = API_KEY;
  }
  return headers;
}

async function apiJson(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: buildHeaders(options.headers ?? {}),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error ?? `API ${path} failed (${response.status})`);
  }
  return body;
}

async function patchStatus(status, patch = {}) {
  const body = { status, ...patch };
  if (status === "rendering" && patch.expectedStatus === undefined) {
    body.expectedStatus = "queued";
  }
  await apiJson(`/render/jobs/${encodeURIComponent(jobId)}/status`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

async function claimJob() {
  const response = await fetch(`${API_URL}/render/jobs/${encodeURIComponent(jobId)}/status`, {
    method: "PATCH",
    headers: buildHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ status: "rendering", expectedStatus: "queued", progress: 5 }),
  });
  if (response.status === 409) {
    return false;
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `Claim failed (${response.status})`);
  }
  return true;
}

async function attachOutputFile(mp4Buffer, job) {
  if (isGcsVaultEnabled()) {
    await patchStatus("encoding", { progress: 85 });
    const objectPath = await uploadRenderOutputToGcs(mp4Buffer, job);
    await apiJson(`/render/jobs/${encodeURIComponent(jobId)}/finalize`, {
      method: "POST",
      body: JSON.stringify({ objectPath }),
    });
    return;
  }

  const localDir = join(root, "apps", "api", "data", "render-jobs", "outputs");
  await mkdir(localDir, { recursive: true });
  const safeJob = jobId.replace(/[^a-zA-Z0-9_-]/g, "_");
  const localPath = join(localDir, `${safeJob}.mp4`);
  await writeFile(localPath, mp4Buffer);

  const outputUrl = `${API_URL}/render/jobs/${encodeURIComponent(jobId)}/output`;
  await apiJson(`/render/jobs/${encodeURIComponent(jobId)}/status`, {
    method: "PATCH",
    body: JSON.stringify({
      status: "done",
      progress: 100,
      outputPath: localPath,
      outputUrl,
    }),
  });
}

function isGcsVaultEnabled() {
  return Boolean(process.env.GCS_VAULT_BUCKET?.trim());
}

async function readDownloadBuffer(download) {
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function loadTestImageDataUrls(count = 3) {
  const urls = [];
  for (let i = 0; i < count; i++) {
    const imagePath = testImages[i] ?? testImages[0];
    if (!existsSync(imagePath)) {
      throw new Error(`Missing test image: ${imagePath}`);
    }
    const base64 = readFileSync(imagePath).toString("base64");
    const mime = imagePath.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
    urls.push(`data:${mime};base64,${base64}`);
  }
  return urls;
}

function buildCrystalShowcaseUrl(job) {
  const settings = job.settings ?? {};
  const catalog = settings.catalogOptions ?? {};
  const shape = catalog.shapeId ?? "cube";
  const backdrop =
    settings.backdropMediaPath === null
      ? ""
      : settings.backdropMediaPath ?? DEFAULT_CRYSTAL_BACKDROP;
  const params = new URLSearchParams({
    renderJob: "1",
    localOnly: "1",
    fullGpu: "1",
    bg: catalog.backgroundPreset ?? "booth",
    shape,
    // Headless export path should not depend on Havok availability.
    noPhysics: "1",
  });
  const look = catalog.look ?? catalog.commercialLookId;
  if (typeof look === "string" && look.length > 0) {
    params.set("look", look);
  }
  if (backdrop === "") {
    params.set("backdrop", "");
  } else if (backdrop) {
    params.set("backdrop", backdrop);
  }
  return `${WEB_BASE}/showcase.html?${params.toString()}`;
}

async function launchBrowser() {
  const headless = process.env.MBOX_HEADED !== "1";
  // When using real GPU paths (ANGLE), prefer system Chrome if available.
  // Playwright-bundled Chromium can be more restrictive depending on install.
  const preferChannel = String(process.env.MBOX_BROWSER_CHANNEL ?? "").trim().toLowerCase();
  const channel =
    preferChannel === "chrome" || preferChannel === "msedge"
      ? preferChannel
      : glMode === "angle"
        ? "chrome"
        : undefined;
  try {
    return await chromium.launch({
      ...(channel ? { channel } : {}),
      headless,
      args: CHROMIUM_ARGS,
    });
  } catch (error) {
    if (channel) {
      console.warn(`[worker] launch failed with channel=${channel}, retrying without channel`, error);
    }
    return chromium.launch({
      headless,
      args: CHROMIUM_ARGS,
    });
  }
}

function resolveCrystalSourceUrls(job) {
  const refs = job.processedImageRefs ?? [];
  const urls = refs
    .map((ref) => ref.url)
    .filter((url) => typeof url === "string" && url.length > 0);
  if (urls.length > 0) {
    return urls;
  }
  return loadTestImageDataUrls(job.settings?.imageCount ?? 3);
}

async function waitForCrystalExportBuffer(page) {
  const downloadPromise = page
    .waitForEvent("download", { timeout: RECORD_TIMEOUT_MS })
    .catch(() => null);

  await page.waitForFunction(
    () => {
      const payload = window.__MBOX_LAST_SHOWCASE_EXPORT__;
      if (payload?.verification?.passed) {
        return true;
      }
      const b64 = window.__MBOX_RENDER_OUTPUT_BASE64__;
      return typeof b64 === "string" && b64.length > 10_000;
    },
    undefined,
    { timeout: RECORD_TIMEOUT_MS, polling: 400 }
  );

  const fromPage = await page.evaluate(() => {
    const b64 = window.__MBOX_RENDER_OUTPUT_BASE64__;
    if (typeof b64 === "string" && b64.length > 10_000) {
      return { kind: "base64", data: b64 };
    }
    const payload = window.__MBOX_LAST_SHOWCASE_EXPORT__;
    if (payload?.verification?.passed) {
      return { kind: "payload", bytes: payload.bytes ?? 0 };
    }
    return null;
  });

  if (fromPage?.kind === "base64") {
    return Buffer.from(fromPage.data, "base64");
  }

  const download = await downloadPromise;
  if (download) {
    return readDownloadBuffer(download);
  }

  throw new Error("Crystal export finished without downloadable output.");
}

/** Auto-export via `renderJob=1` + injected job payload (cloud fast profile). */
async function runCrystalJob(job) {
  const sourceUrls = resolveCrystalSourceUrls(job);
  const url = buildCrystalShowcaseUrl(job);
  const settings = job.settings ?? {};
  const catalogOverrides = settings.catalogOptions ?? {};
  const includeBgm = catalogOverrides.bgmEnabled === true;
  const outputFps = job.outputProfile?.fps ?? 30;
  const pacedExport = outputFps > 30;
  const browser = await launchBrowser();
  try {
    const context = await browser.newContext({ acceptDownloads: true });
    await context.addInitScript(
      (payload) => {
        window.__MBOX_RENDER_JOB__ = payload.job;
        window.__MBOX_RENDER_JOB_AUTO__ = true;
        window.__MBOX_RENDER_JOB_SOURCE_URLS__ = payload.sourceUrls;
        window.__MBOX_RENDER_CATALOG_OVERRIDES__ = payload.catalogOverrides;
        if (payload.includeBgm) {
          window.__MBOX_RENDER_INCLUDE_BGM__ = true;
        }
        if (payload.pacedExport) {
          window.__MBOX_LOCAL_GPU_EXPORT__ = true;
        }
        window.__MBOX_E2E_EXPORT__ = true;
        window.__MBOX_SHOWCASE_AUTOMATION__ = true;
        window.__MBOX_RENDER_BACKEND__ = "local";
      },
      { job, sourceUrls, catalogOverrides, includeBgm, pacedExport }
    );
    const page = await context.newPage();
    browser.on("disconnected", () => console.log("[worker] browser disconnected"));
    page.on("crash", () => console.log("[worker] page crashed"));
    page.on("close", () => console.log("[worker] page closed"));
    page.on("console", (msg) => console.log("[BROWSER CONSOLE]", msg.type(), msg.text()));
    page.on("pageerror", (err) => console.log("[BROWSER PAGEERROR]", String(err)));

    const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
    console.log("[worker] goto", url, "→", response?.status());
    if (!response?.ok()) {
      throw new Error(`Showcase load failed: ${response?.status()}`);
    }

    const buffer = await waitForCrystalExportBuffer(page);
    if (buffer.length < 80_000) {
      throw new Error(`Crystal export too small (${buffer.length} bytes)`);
    }
    return buffer;
  } finally {
    await browser.close();
  }
}

async function main() {
  const { job } = await apiJson(`/render/jobs/${encodeURIComponent(jobId)}`);
  console.log(`Processing ${job.id} (${job.kind})`);

  if (job.kind !== "crystal_showcase") {
    throw new Error(`Unsupported render job kind: ${job.kind}`);
  }

  const claimed = await claimJob();
  if (!claimed) {
    console.log(`Skip ${job.id}: already claimed`);
    return;
  }

  const mp4Buffer = await runCrystalJob(job);

  if (!mp4Buffer || mp4Buffer.length < 80_000) {
    throw new Error(`Export too small: ${mp4Buffer?.length ?? 0} bytes`);
  }

  await patchStatus("encoding", { progress: 85 });

  await attachOutputFile(mp4Buffer, job);

  const finalJob = await apiJson(`/render/jobs/${encodeURIComponent(jobId)}`);
  console.log(`Done: ${finalJob.job?.outputUrl ?? jobId} (${mp4Buffer.length} bytes)`);
}

main().catch(async (error) => {
  console.error(error);
  try {
    await patchStatus("failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  } catch {
    // ignore
  }
  process.exit(1);
});
