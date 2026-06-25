/**
 * Force system Chrome (Playwright) onto Windows "High performance" GPU (NVIDIA/AMD dGPU).
 * Hybrid laptops often default to Intel UHD even when a GTX is present.
 */
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const CHROME_CANDIDATES = [
  process.env["PROGRAMFILES"] && join(process.env["PROGRAMFILES"], "Google", "Chrome", "Application", "chrome.exe"),
  process.env["PROGRAMFILES(X86)"] &&
    join(process.env["PROGRAMFILES(X86)"], "Google", "Chrome", "Application", "chrome.exe"),
  process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe"),
].filter(Boolean);

export function findChromeExecutable() {
  for (const candidate of CHROME_CANDIDATES) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

/** HKCU DirectX UserGpuPreferences — GpuPreference=2 is High performance (discrete). */
export function ensureWindowsDiscreteGpuPreference(chromePath = findChromeExecutable()) {
  if (process.platform !== "win32" || !chromePath || process.env.MBOX_ALLOW_IGPU === "1") {
    return false;
  }
  try {
    const key = "HKCU\\SOFTWARE\\Microsoft\\DirectX\\UserGpuPreferences";
    execSync(`reg add "${key}" /f`, { stdio: "ignore" });
    execSync(`reg add "${key}" /v "${chromePath}" /t REG_SZ /d "GpuPreference=2;" /f`, {
      stdio: "ignore",
    });
    console.log("Windows GPU preference set: High performance ->", chromePath);
    return true;
  } catch (error) {
    console.warn("[warn] Could not set Windows discrete GPU preference:", error?.message ?? error);
    return false;
  }
}

export function resolveChromeDiscreteGpuArgs() {
  const mode = String(process.env.MBOX_GL ?? "angle").trim().toLowerCase();
  const gl = mode === "swiftshader" ? "swiftshader" : "angle";
  const args = [`--use-gl=${gl}`, "--ignore-gpu-blocklist", "--enable-webgl"];

  if (mode !== "swiftshader" && process.env.MBOX_ALLOW_IGPU !== "1") {
    args.push(
      "--force-high-performance-gpu",
      "--disable-gpu-driver-bug-workarounds",
      "--use-angle=d3d11"
    );
  }

  return args;
}

export function classifyWebGlRenderer(renderer) {
  const text = String(renderer ?? "");
  const discrete =
    /nvidia|geforce|rtx|gtx|quadro|amd|radeon|rx\s*\d|4060|4070|4080|4090/i.test(text);
  const intel = /intel/i.test(text);
  const software = /swiftshader|llvmpipe|microsoft basic render/i.test(text);
  return { text, discrete, intel, software };
}

export function assertDiscreteGpuOrExplain(renderer) {
  const info = classifyWebGlRenderer(renderer);
  if (info.software) {
    return {
      ok: false,
      message:
        "WebGL is on software rendering (SwiftShader). Set MBOX_GL=angle and install GPU drivers.",
    };
  }
  if (info.intel && !info.discrete && process.env.MBOX_ALLOW_IGPU !== "1") {
    return {
      ok: false,
      message: [
        "Chrome is using Intel integrated graphics, not your discrete GPU (e.g. GTX 4060).",
        "Fix (one-time): Windows Settings -> System -> Display -> Graphics ->",
        "  add Google Chrome -> Options -> High performance (NVIDIA).",
        "Or re-run export (this script sets UserGpuPreferences automatically).",
        "Override: MBOX_ALLOW_IGPU=1 to skip this check.",
        `Renderer: ${info.text}`,
      ].join("\n"),
    };
  }
  return { ok: true, message: null };
}
