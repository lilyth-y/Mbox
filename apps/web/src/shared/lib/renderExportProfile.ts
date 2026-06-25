import type { RenderOutputProfile } from "@mbox/shared";
import { CLOUD_CRYSTAL_OUTPUT_PROFILE } from "@mbox/shared";
import { readRenderJobFromWindow } from "./renderJobWindow";

/** Headless Playwright worker or auto `renderJob=1` export session. */
export function isRenderWorkerExportSession(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return Boolean(window.__MBOX_E2E_EXPORT__) || Boolean(readRenderJobFromWindow());
}

/** Local MP4 export via system Chrome + ANGLE — must use full GPU budget, not worker simplified. */
export function isLocalGpuExportSession(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return window.__MBOX_LOCAL_GPU_EXPORT__ === true;
}

export function readRenderOutputProfileFromSession(): RenderOutputProfile | null {
  const job = readRenderJobFromWindow();
  return job?.outputProfile ?? null;
}

/** Cloud / worker session profile, or null for local in-browser defaults. */
export function resolveCrystalExportProfile(): RenderOutputProfile | null {
  const fromJob = readRenderOutputProfileFromSession();
  if (fromJob) {
    return fromJob;
  }
  if (readRenderJobFromWindow()) {
    return CLOUD_CRYSTAL_OUTPUT_PROFILE;
  }
  return null;
}

export function isCloudFastCrystalExport(profile: RenderOutputProfile): boolean {
  return profile.fps <= 30 && profile.width <= 1080;
}
