import { resolveRenderBackend } from "./renderBackend";
import {
  isLocalGpuExportSession,
  isRenderWorkerExportSession,
} from "./renderExportProfile";
import { readRenderJobFromWindow } from "./renderJobWindow";

/**
 * GPU presentation policy for the web app.
 * - local: discrete GPU preview/export (localhost, Cursor Electron, fullGpu=1)
 * - cloud: headless worker / remote render job (simplified tier)
 * - safe: explicit ?safe=1 low-power fallback
 */
export type GpuSessionMode = "local" | "cloud" | "safe";

export function isEmbeddedIdeShell(): boolean {
  if (typeof navigator === "undefined") {
    return false;
  }
  return /\bElectron\b/i.test(navigator.userAgent);
}

/** Headless Playwright Chrome tab that owns Babylon (not the Cursor UI shell). */
export function isGpuRelaySourceSession(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return new URLSearchParams(window.location.search).get("gpuRelaySource") === "1";
}

export function readGpuWorkerSessionId(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return new URLSearchParams(window.location.search).get("gpuWorkerSession");
}

export function isLocalhostDevHost(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  const host = window.location.hostname;
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
}

/** Local RTX/ANGLE path — includes Cursor/VS Code Electron loading localhost dev server. */
export function isLocalGpuSession(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  if (isLocalGpuExportSession()) {
    return true;
  }
  const params = new URLSearchParams(window.location.search);
  if (params.get("safe") === "1") {
    return false;
  }
  if (params.get("fullGpu") === "1") {
    return true;
  }
  return false;
}

/** @deprecated use isLocalGpuSession */
export const isLocalGpuPreview = isLocalGpuSession;

/** Only ?safe=1 — never auto-detect Windows/Electron as low GPU. */
export function isGpuSafeMode(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  if (isLocalGpuSession()) {
    return false;
  }
  return new URLSearchParams(window.location.search).get("safe") === "1";
}

/** Cloud Playwright worker / remote render job — simplified capture tier. */
export function isCloudGpuSession(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  if (isLocalGpuSession()) {
    return false;
  }
  if (isRenderWorkerExportSession()) {
    return true;
  }
  if (readRenderJobFromWindow()) {
    return true;
  }
  if (import.meta.env.PROD && resolveRenderBackend() === "cloud") {
    return true;
  }
  return false;
}

export function resolveGpuSessionMode(): GpuSessionMode {
  if (isGpuSafeMode()) {
    return "safe";
  }
  if (isCloudGpuSession()) {
    return "cloud";
  }
  return "local";
}

/** Inject localOnly + noPhysics on localhost showcase (fullGpu is opt-in for RTX preview/export). */
export function ensureLocalGpuSearchParams(): void {
  if (typeof window === "undefined") {
    return;
  }
  if (!isLocalhostDevHost()) {
    return;
  }
  const params = new URLSearchParams(window.location.search);
  if (params.get("safe") === "1") {
    return;
  }
  let changed = false;
  if (params.get("localOnly") !== "1") {
    params.set("localOnly", "1");
    changed = true;
  }
  if (params.get("noPhysics") !== "1") {
    params.set("noPhysics", "1");
    changed = true;
  }
  if (changed) {
    const next = `${window.location.pathname}?${params.toString()}${window.location.hash}`;
    window.history.replaceState(null, "", next);
  }
}

/** Dev localhost preview without ?fullGpu=1 — stable simplified tier (export still uses fullGpu). */
export function isLocalhostInteractivePreview(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  if (!isLocalhostDevHost()) {
    return false;
  }
  const params = new URLSearchParams(window.location.search);
  return params.get("fullGpu") !== "1" && params.get("safe") !== "1";
}
