import type { RenderJobRecord } from "@mbox/shared";

declare global {
  interface Window {
    __MBOX_RENDER_JOB__?: RenderJobRecord;
    __MBOX_RENDER_JOB_AUTO__?: boolean;
    __MBOX_RENDER_JOB_SOURCE_URLS__?: string[];
    /** Playwright local export — force full GPU tier + ANGLE (not cloud worker simplified). */
    __MBOX_LOCAL_GPU_EXPORT__?: boolean;
  }
}

export function readRenderJobFromWindow(): RenderJobRecord | null {
  if (typeof window === "undefined") {
    return null;
  }
  const job = window.__MBOX_RENDER_JOB__;
  return job && typeof job.id === "string" ? job : null;
}

export function isRenderJobAutoMode(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  if (window.__MBOX_RENDER_JOB_AUTO__) {
    return true;
  }
  const params = new URLSearchParams(window.location.search);
  return params.get("renderJob") === "1" || params.has("renderJob");
}

export function readRenderJobSourceUrls(): string[] | null {
  if (typeof window === "undefined") {
    return null;
  }
  const urls = window.__MBOX_RENDER_JOB_SOURCE_URLS__;
  if (!Array.isArray(urls) || urls.length === 0) {
    return null;
  }
  return urls.filter((url): url is string => typeof url === "string" && url.length > 0);
}
