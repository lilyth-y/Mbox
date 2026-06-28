import type { RenderJobRecord } from "@mbox/shared";

import type { ShowcaseCatalogOptions } from "../../features/showcase/showcaseCatalogOptions";

declare global {
  interface Window {
    __MBOX_RENDER_JOB__?: RenderJobRecord;
    __MBOX_RENDER_JOB_AUTO__?: boolean;
    __MBOX_RENDER_JOB_SOURCE_URLS__?: string[];
    /** Job catalogOptions merged over URL-parsed showcase catalog. */
    __MBOX_RENDER_CATALOG_OVERRIDES__?: Partial<ShowcaseCatalogOptions>;
    /** Product render — mux BGM even when __MBOX_E2E_EXPORT__ (headless worker). */
    __MBOX_RENDER_INCLUDE_BGM__?: boolean;
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

export function readRenderJobCatalogOverrides(): Partial<ShowcaseCatalogOptions> | null {
  if (typeof window === "undefined") {
    return null;
  }
  const overrides = window.__MBOX_RENDER_CATALOG_OVERRIDES__;
  if (!overrides || typeof overrides !== "object") {
    return null;
  }
  return overrides;
}

export function isRenderJobIncludeBgm(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return window.__MBOX_RENDER_INCLUDE_BGM__ === true;
}
