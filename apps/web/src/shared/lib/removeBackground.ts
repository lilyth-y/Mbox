import type { ProcessedImage } from "../../shared/types";
import { editImageBackground } from "../api/client";
import { prepareImageForApi } from "./prepareImageForApi";
import {
  preloadBackgroundRemovalEngine,
  removeBackgroundLocal,
  type BackgroundRemovalProgressHandler,
} from "./removeBackgroundLocal";

export interface BackgroundRemovalResult {
  imageBase64: string;
  mimeType: string;
  provider: "local" | "matte";
  model?: string;
}

function createProgressRelay(
  imageLabel: string,
  onStatus?: (message: string) => void
): BackgroundRemovalProgressHandler {
  return (message, _key, current, total) => {
    if (total <= 0) {
      onStatus?.(`[${imageLabel}] ${message}`);
      return;
    }
    const percent = Math.min(100, Math.round((current / total) * 100));
    if (percent === 0 || percent === 100 || percent % 10 === 0) {
      onStatus?.(`[${imageLabel}] ${message} ${percent}%`);
    }
  };
}

/** Preload IMG.LY WASM + ONNX (pinned CDN version). Call before batch removal. */
export async function prepareBackgroundRemovalEngine(
  onStatus?: (message: string) => void
): Promise<void> {
  onStatus?.("누끼 AI 모델 준비 중 (최초 1회, 이후 캐시)...");
  await preloadBackgroundRemovalEngine((message, _key, current, total) => {
    if (total <= 0) {
      onStatus?.(message);
      return;
    }
    const percent = Math.min(100, Math.round((current / total) * 100));
    onStatus?.(`${message} ${percent}%`);
  });
  onStatus?.("누끼 AI 모델 준비 완료");
}

/**
 * 1) Browser segmentation (@imgly, version-pinned assets)
 * 2) API matte from analysis bounds (offline fallback)
 */
export interface RemoveBackgroundOptions {
  /** Skip 960px downscale — use when source is already the face square crop (1024). */
  preserveSquareCrop?: boolean;
}

export async function removeBackgroundForImage(
  image: ProcessedImage,
  sourceDataUrl: string,
  onStatus?: (message: string) => void,
  options: RemoveBackgroundOptions = {}
): Promise<BackgroundRemovalResult> {
  const prepared = options.preserveSquareCrop
    ? {
        mimeType: sourceDataUrl.startsWith("data:image/png") ? "image/png" : "image/jpeg",
        base64: sourceDataUrl.includes(",") ? sourceDataUrl.split(",")[1]! : sourceDataUrl,
      }
    : await prepareImageForApi(sourceDataUrl);
  const preparedDataUrl = `data:${prepared.mimeType};base64,${prepared.base64}`;
  const progress = createProgressRelay(image.label, onStatus);

  try {
    onStatus?.(`[${image.label}] 브라우저 AI로 배경 분리 중...`);
    const local = await removeBackgroundLocal(preparedDataUrl, progress);
    onStatus?.(`[${image.label}] 브라우저 AI 분리 완료 (${local.model})`);
    return { ...local, provider: "local" };
  } catch (localError) {
    const reason = localError instanceof Error ? localError.message : "local removal failed";
    onStatus?.(`[${image.label}] 서버 마스크로 배경 제거 중... (${reason})`);
    const matte = await editImageBackground(
      prepared.base64,
      image.label,
      "",
      prepared.mimeType,
      "remove_background",
      image.subject.bounds
    );
    return { ...matte, provider: "matte" };
  }
}
