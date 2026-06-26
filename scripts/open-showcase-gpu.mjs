#!/usr/bin/env node
/**
 * Open showcase in system Chrome with discrete GPU (RTX) — fully automated.
 * Sets Windows GPU preference, Chrome HW-accel profile prefs, starts dev server if needed,
 * opens a headed window, waits until 3D preview is ready, then leaves the browser open.
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import {
  assertDiscreteGpuOrExplain,
  ensureWindowsDiscreteGpuPreference,
  findChromeExecutable,
  resolveChromeDiscreteGpuArgs,
} from "./chrome-discrete-gpu.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const PROFILE_DIR = join(
  process.env.TEMP || process.env.TMP || "/tmp",
  "mbox-showcase-gpu"
);

const DEFAULT_URL =
  process.env.MBOX_WEB_URL?.trim() ||
  "http://localhost:5173/showcase.html?localOnly=1&fullGpu=1&companionTarget=1&look=rose_gold_premium&bg=solid_black&noPhysics=1";

function ensureFullGpuUrl(rawUrl) {
  try {
    const u = new URL(rawUrl);
  if (u.searchParams.get("fullGpu") !== "1") u.searchParams.set("fullGpu", "1");
  if (u.searchParams.get("localOnly") !== "1") u.searchParams.set("localOnly", "1");
  if (u.searchParams.get("companionTarget") !== "1") u.searchParams.set("companionTarget", "1");
  return u.toString();
  } catch {
    return rawUrl;
  }
}

async function ensureDevServer(url) {
  const origin = new URL(url).origin;
  try {
    const res = await fetch(`${origin}/showcase.html`, { signal: AbortSignal.timeout(4_000) });
    if (res.ok) {
      console.log(`Dev server OK: ${origin}`);
      return;
    }
  } catch {
    // start below
  }
  console.log("Starting Vite dev server (@mbox/web)…");
  const { spawn } = await import("node:child_process");
  const child = spawn("npm", ["run", "dev", "--workspace", "@mbox/web"], {
    cwd: root,
    shell: true,
    detached: true,
    stdio: "ignore",
  });
  child.unref();
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1_500));
    try {
      const res = await fetch(`${origin}/showcase.html`, { signal: AbortSignal.timeout(4_000) });
      if (res.ok) {
        console.log(`Dev server ready: ${origin}`);
        return;
      }
    } catch {
      /* retry */
    }
  }
  throw new Error(`Dev server did not start at ${origin} within 90s`);
}

async function ensureChromeHardwareAccelPrefs(profileDir) {
  await mkdir(join(profileDir, "Default"), { recursive: true });
  const prefsPath = join(profileDir, "Default", "Preferences");
  let prefs = {};
  if (existsSync(prefsPath)) {
    try {
      prefs = JSON.parse(await readFile(prefsPath, "utf8"));
    } catch {
      prefs = {};
    }
  }
  prefs.hardware_acceleration_mode_previous = true;
  await writeFile(prefsPath, JSON.stringify(prefs, null, 2));

  const localStatePath = join(profileDir, "Local State");
  let localState = {};
  if (existsSync(localStatePath)) {
    try {
      localState = JSON.parse(await readFile(localStatePath, "utf8"));
    } catch {
      localState = {};
    }
  }
  localState.hardware_acceleration_mode_previous = true;
  localState.hardware_acceleration_mode_enabled = true;
  await writeFile(localStatePath, JSON.stringify(localState, null, 2));
}

async function probeGpu(page) {
  return page.evaluate(() => {
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl2") || c.getContext("webgl");
    if (!gl) return { ok: false, renderer: null, webgl2: false };
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const renderer = ext
      ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)
      : gl.getParameter(gl.RENDERER);
    return { ok: true, webgl2: gl instanceof WebGL2RenderingContext, renderer };
  });
}

async function waitShowcaseReady(page, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const snap = await page.evaluate(() => {
      const err = document.body.innerText.includes("WebGL 컨텍스트를 만들지 못했습니다");
      const canvas = document.querySelector("canvas");
      const report = window.__MBOX_SHOWCASE_RESOURCE_REPORT__;
      const mp4 = [...document.querySelectorAll("button")].find((b) => /MP4/i.test(b.textContent ?? ""));
      return {
        err,
        hasCanvas: Boolean(canvas),
        gpuTier: report?.gpuTier ?? null,
        jewelMs: report?.phases?.find((p) => p.phase === "jewel_spawn")?.ms ?? null,
        mp4Ready: Boolean(mp4 && !mp4.disabled),
        status: document.body.innerText.match(/로컬 GPU|준비|장 ·/g)?.slice(0, 2) ?? [],
      };
    });
    if (snap.err) {
      throw new Error("Showcase WebGL init failed in browser (probe on page)");
    }
    if (snap.mp4Ready || (snap.hasCanvas && snap.gpuTier === "full" && snap.jewelMs != null)) {
      return snap;
    }
    await page.waitForTimeout(800);
  }
  throw new Error("Showcase did not become ready in time");
}

const url = ensureFullGpuUrl(DEFAULT_URL);
const chromePath = findChromeExecutable();
if (chromePath) {
  ensureWindowsDiscreteGpuPreference(chromePath);
}
await ensureChromeHardwareAccelPrefs(PROFILE_DIR);
await ensureDevServer(url);

const gpuArgs = [
  ...resolveChromeDiscreteGpuArgs(),
  "--disable-software-rasterizer",
  "--enable-gpu-rasterization",
  "--no-first-run",
  "--no-default-browser-check",
];

console.log("Opening Chrome (GPU, headed)…");
console.log("Profile:", PROFILE_DIR);
console.log("URL:", url);

const context = await chromium.launchPersistentContext(PROFILE_DIR, {
  channel: "chrome",
  headless: false,
  viewport: { width: 1440, height: 900 },
  args: gpuArgs,
  ignoreDefaultArgs: ["--enable-automation"],
});

await context.addInitScript(() => {
  window.__MBOX_LOCAL_GPU_EXPORT__ = false;
});

const page = context.pages()[0] ?? (await context.newPage());
const gpuBefore = await probeGpu(page);
if (!gpuBefore.ok) {
  throw new Error("WebGL probe failed before navigation");
}
const discreteCheck = assertDiscreteGpuOrExplain(gpuBefore.renderer);
if (!discreteCheck.ok) {
  console.warn(discreteCheck.message);
}

await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120_000 });
const ready = await waitShowcaseReady(page);
const gpuAfter = await probeGpu(page);

console.log("");
console.log("=== Showcase GPU ready ===");
console.log("Renderer:", gpuAfter.renderer ?? gpuBefore.renderer);
console.log("WebGL2:", gpuAfter.webgl2 ?? gpuBefore.webgl2);
console.log("GPU tier:", ready.gpuTier);
console.log("Jewel spawn:", ready.jewelMs != null ? `${ready.jewelMs}ms` : "—");
console.log("Browser left open — close the window when done.");
console.log("");

// Keep Node alive while Chrome runs.
context.on("close", () => process.exit(0));
await new Promise(() => {});
