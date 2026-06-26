import type { ProcessedImage } from "../types";
import type { ShowcasePresentationPreferences } from "../../features/showcase/pipeline/showcasePresentationPreferences";
import type { ShowcaseCatalogOptions } from "../../features/showcase/showcaseCatalogOptions";
import { persistShowcaseCustomBackdrop } from "../../features/showcase/showcaseBackgroundMedia";

export const SHOWCASE_COMPANION_CHANNEL = "mbox-showcase-companion";

/** Max blob→data URL size for cross-tab backdrop sync (custom video uploads). */
const COMPANION_BACKDROP_BLOB_MAX_BYTES = 48 * 1024 * 1024;

export type ShowcaseCompanionState = {
  revision: number;
  images: ProcessedImage[];
  catalog: ShowcaseCatalogOptions;
  presentationPrefs: ShowcasePresentationPreferences;
  playing: boolean;
  backdropMediaPath: string | null;
};

export type ShowcaseCompanionMessage =
  | { type: "ping" }
  | { type: "pong"; sceneReady: boolean }
  | { type: "state"; payload: ShowcaseCompanionState }
  | { type: "requestExport" }
  | { type: "exportStarted" }
  | { type: "exportDone"; filename: string }
  | { type: "exportFailed"; message: string };

export function isChromeCompanionTarget(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return new URLSearchParams(window.location.search).get("companionTarget") === "1";
}

/** RTX Chrome tab URL — native GPU, no MJPEG relay. */
export function buildChromeGpuPreviewUrl(baseHref?: string): string {
  const u = new URL(baseHref ?? window.location.href);
  u.searchParams.set("fullGpu", "1");
  u.searchParams.set("localOnly", "1");
  u.searchParams.set("companionTarget", "1");
  u.searchParams.set("noPhysics", "1");
  u.searchParams.delete("forceGpuRelay");
  u.searchParams.delete("gpuRelaySource");
  u.searchParams.delete("gpuWorkerSession");
  return u.toString();
}

async function blobUrlToDataUrl(url: string): Promise<string> {
  if (!url.startsWith("blob:")) {
    return url;
  }
  const res = await fetch(url);
  const blob = await res.blob();
  if (blob.size > COMPANION_BACKDROP_BLOB_MAX_BYTES) {
    throw new Error(
      `배경 미디어가 너무 큽니다 (${Math.round(blob.size / (1024 * 1024))}MB). 48MB 이하로 줄여 주세요.`
    );
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? url));
    reader.onerror = () => reject(reader.error ?? new Error("blob read failed"));
    reader.readAsDataURL(blob);
  });
}

async function serializeMediaPath(url: string | null): Promise<string | null> {
  if (!url) {
    return null;
  }
  try {
    return await blobUrlToDataUrl(url);
  } catch {
    return url;
  }
}

/** Chrome target tab — restore custom backdrop from shell sync payload. */
export function applyInboundCompanionCatalog(
  catalog: ShowcaseCatalogOptions
): ShowcaseCatalogOptions {
  if (catalog.backgroundMediaSource !== "custom") {
    return catalog;
  }
  const path = catalog.backgroundMediaPath?.trim() ?? "";
  if (path.startsWith("data:")) {
    persistShowcaseCustomBackdrop(path);
    return { ...catalog, backgroundMediaPath: path };
  }
  return catalog;
}

async function serializeImageUrls(image: ProcessedImage): Promise<ProcessedImage> {
  const [url, preparedUrl, preCropSourceUrl, originalUrl] = await Promise.all([
    blobUrlToDataUrl(image.url),
    image.preparedUrl ? blobUrlToDataUrl(image.preparedUrl) : Promise.resolve(image.preparedUrl),
    image.preCropSourceUrl
      ? blobUrlToDataUrl(image.preCropSourceUrl)
      : Promise.resolve(image.preCropSourceUrl),
    image.originalUrl ? blobUrlToDataUrl(image.originalUrl) : Promise.resolve(image.originalUrl),
  ]);
  return { ...image, url, preparedUrl, preCropSourceUrl, originalUrl };
}

export async function serializeCompanionState(
  state: Omit<ShowcaseCompanionState, "revision"> & { revision: number }
): Promise<ShowcaseCompanionState> {
  const images = await Promise.all(state.images.map(serializeImageUrls));

  const serializedBackdrop = await serializeMediaPath(state.backdropMediaPath);
  let catalog = state.catalog;

  if (catalog.backgroundMediaSource === "custom" && serializedBackdrop) {
    catalog = {
      ...catalog,
      backgroundMediaPath: serializedBackdrop,
      backgroundMediaIsVideo:
        catalog.backgroundMediaIsVideo ?? serializedBackdrop.startsWith("data:video/"),
    };
  }

  return {
    ...state,
    images,
    catalog,
    backdropMediaPath: serializedBackdrop,
  };
}

export function postCompanionMessage(message: ShowcaseCompanionMessage): void {
  if (typeof BroadcastChannel === "undefined") {
    return;
  }
  const channel = new BroadcastChannel(SHOWCASE_COMPANION_CHANNEL);
  channel.postMessage(message);
  channel.close();
}

export function companionAutoOpenStorageKey(): string {
  return `mbox-chrome-companion-opened:${window.location.pathname}`;
}

export function markCompanionAutoOpened(): void {
  sessionStorage.setItem(companionAutoOpenStorageKey(), "1");
}

export function wasCompanionAutoOpened(): boolean {
  return sessionStorage.getItem(companionAutoOpenStorageKey()) === "1";
}
