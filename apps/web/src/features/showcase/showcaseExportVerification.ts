import { looksLikeIsoMp4 } from "./export/showcaseRecorder";
import type { ShowcaseContentManifest } from "./pipeline/showcaseStageVersions";
import { SHOWCASE_DEVICE_EXPORT_SIZE } from "./showcaseExportSpecs";
import {
  compareShowcaseExportFingerprints,
  fingerprintFromVideoFrame,
  type ShowcaseFrameFingerprint,
  type ShowcaseWysiwygVerificationResult,
} from "./showcaseExportWysiwyg";

export type ShowcaseExportVerificationResult = {
  passed: boolean;
  width: number;
  height: number;
  durationSec: number;
  centerLuma: number;
  cornerLuma: number;
  isSquare: boolean;
  isTargetSize: boolean;
  hasVisibleBackground: boolean;
  isIsoMp4: boolean;
  wysiwyg?: ShowcaseWysiwygVerificationResult;
  errors: string[];
};

export type ShowcaseExportVerificationOptions = {
  expectedWidth?: number;
  expectedHeight?: number;
  expectedDurationSec: number;
  durationToleranceSec?: number;
  minCenterLuma?: number;
  minFileBytes?: number;
  /** Pre-record composite fingerprint — enables WYSIWYG check on first export frame. */
  previewFingerprint?: ShowcaseFrameFingerprint;
};

const DEFAULT_MIN_CENTER_LUMA = 22;
const DEFAULT_MIN_FILE_BYTES = 80_000;

async function loadExportVideo(blob: Blob): Promise<HTMLVideoElement> {
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  const url = URL.createObjectURL(blob);
  video.src = url;

  await new Promise<void>((resolve, reject) => {
    const onReady = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("[showcase] export verification — video load failed"));
    };
    const cleanup = () => {
      video.removeEventListener("loadedmetadata", onReady);
      video.removeEventListener("error", onError);
    };
    video.addEventListener("loadedmetadata", onReady, { once: true });
    video.addEventListener("error", onError, { once: true });
  });

  video.addEventListener(
    "error",
    () => {
      URL.revokeObjectURL(url);
    },
    { once: true }
  );

  return video;
}

async function seekVideo(video: HTMLVideoElement, timeSec: number): Promise<void> {
  if (video.readyState < HTMLMediaElement.HAVE_METADATA) {
    await new Promise<void>((resolve) => {
      video.addEventListener("loadedmetadata", () => resolve(), { once: true });
    });
  }
  if (Math.abs(video.currentTime - timeSec) < 0.02) {
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup();
      resolve();
    }, 2_000);
    const onSeeked = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("[showcase] export verification — seek failed"));
    };
    const cleanup = () => {
      window.clearTimeout(timer);
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
    };
    video.addEventListener("seeked", onSeeked, { once: true });
    video.addEventListener("error", onError, { once: true });
    try {
      video.currentTime = timeSec;
    } catch {
      cleanup();
      resolve();
    }
  });
}

export async function verifyShowcaseExportBlob(
  blob: Blob,
  options: ShowcaseExportVerificationOptions
): Promise<ShowcaseExportVerificationResult> {
  const expectedWidth = options.expectedWidth ?? SHOWCASE_DEVICE_EXPORT_SIZE;
  const expectedHeight = options.expectedHeight ?? SHOWCASE_DEVICE_EXPORT_SIZE;
  const durationToleranceSec =
    options.durationToleranceSec ??
    Math.max(2, options.expectedDurationSec * 0.15);
  const minCenterLuma = options.minCenterLuma ?? DEFAULT_MIN_CENTER_LUMA;
  const minFileBytes = options.minFileBytes ?? DEFAULT_MIN_FILE_BYTES;

  const errors: string[] = [];
  if (blob.size < minFileBytes) {
    errors.push(`파일 크기가 너무 작습니다 (${blob.size} bytes).`);
  }

  const isIsoMp4 = await looksLikeIsoMp4(blob);

  let width = 0;
  let height = 0;
  let durationSec = 0;
  let centerLuma = 0;
  let cornerLuma = 0;
  let wysiwyg: ShowcaseWysiwygVerificationResult | undefined;

  const video = await loadExportVideo(blob);
  try {
    width = video.videoWidth;
    height = video.videoHeight;
    durationSec = Number.isFinite(video.duration) ? video.duration : 0;

    if (width !== expectedWidth || height !== expectedHeight) {
      errors.push(
        `해상도 불일치: ${width}×${height} (기대 ${expectedWidth}×${expectedHeight}).`
      );
    }

    if (
      durationSec <= 0 ||
      Math.abs(durationSec - options.expectedDurationSec) > durationToleranceSec
    ) {
      errors.push(
        `길이 불일치: ${durationSec.toFixed(2)}s (기대 ${options.expectedDurationSec.toFixed(2)}s ±${durationToleranceSec.toFixed(1)}s).`
      );
    }

    const sampleSec = Math.min(0.25, Math.max(0, durationSec * 0.02));
    await seekVideo(video, sampleSec);

    const exportFingerprint = fingerprintFromVideoFrame(video, width, height);
    centerLuma = exportFingerprint.centerLuma;
    cornerLuma = exportFingerprint.cornerLuma;

    if (centerLuma < minCenterLuma) {
      errors.push(
        `첫 프레임 중앙 밝기가 너무 어둡습니다 (luma ${centerLuma.toFixed(1)}). 배경이 누락됐을 수 있습니다.`
      );
    }

    const skipWysiwyg =
      typeof window !== "undefined" && window.__MBOX_E2E_EXPORT__ === true;
    if (options.previewFingerprint && !skipWysiwyg) {
      wysiwyg = compareShowcaseExportFingerprints(
        options.previewFingerprint,
        exportFingerprint
      );
      if (!wysiwyg.passed) {
        errors.push(...wysiwyg.errors);
      }
    }
  } finally {
    const src = video.src;
    video.pause();
    video.removeAttribute("src");
    video.load();
    if (src.startsWith("blob:")) {
      URL.revokeObjectURL(src);
    }
  }

  const hasVisibleBackground = centerLuma >= minCenterLuma;

  return {
    passed: errors.length === 0,
    width,
    height,
    durationSec,
    centerLuma,
    cornerLuma,
    isSquare: width === height,
    isTargetSize: width === expectedWidth && height === expectedHeight,
    hasVisibleBackground,
    isIsoMp4,
    wysiwyg,
    errors,
  };
}

export type ShowcaseExportE2ePayload = {
  bytes: number;
  filename: string;
  mimeType: string;
  verification: ShowcaseExportVerificationResult;
  contentManifest?: ShowcaseContentManifest;
};

declare global {
  interface Window {
    __MBOX_LAST_SHOWCASE_EXPORT__?: ShowcaseExportE2ePayload;
    /** Base64 MP4/WebM for headless render workers (when __MBOX_E2E_EXPORT__). */
    __MBOX_RENDER_OUTPUT_BASE64__?: string;
  }
}

export async function publishRenderWorkerBlob(blob: Blob): Promise<void> {
  if (typeof window === "undefined" || !window.__MBOX_E2E_EXPORT__) {
    return;
  }
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("readAsDataURL failed"));
    reader.readAsDataURL(blob);
  });
  const comma = dataUrl.indexOf(",");
  window.__MBOX_RENDER_OUTPUT_BASE64__ =
    comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
}

export function publishShowcaseExportE2ePayload(
  payload: ShowcaseExportE2ePayload
): void {
  if (typeof window !== "undefined") {
    window.__MBOX_LAST_SHOWCASE_EXPORT__ = payload;
  }
}
