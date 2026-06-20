import type { ShowcaseCatalogOptions } from "./showcaseCatalogOptions";
import {
  isShowcaseExportPreviewBackdropReady,
  resolveLiveShowcaseDomBackdrop,
} from "./showcaseExportBackdrop";

export type ShowcaseExportReadinessInput = {
  sceneReady: boolean;
  presentationCount: number;
  isRecording: boolean;
  isProcessingUpload: boolean;
  catalog: ShowcaseCatalogOptions;
  backdropMediaPath: string | null;
  backdropSource: HTMLVideoElement | HTMLImageElement | null;
};

export type ShowcaseExportReadiness = {
  ready: boolean;
  reason: string | null;
};

export function resolveShowcaseExportBackdropElement(
  backdropSource: HTMLVideoElement | HTMLImageElement | null
): HTMLVideoElement | HTMLImageElement | null {
  return resolveLiveShowcaseDomBackdrop(backdropSource);
}

export function evaluateShowcaseExportReadiness(
  input: ShowcaseExportReadinessInput
): ShowcaseExportReadiness {
  if (input.isRecording) {
    return { ready: false, reason: "MP4 생성 중입니다." };
  }
  if (input.isProcessingUpload) {
    return { ready: false, reason: "사진 처리 중입니다." };
  }
  if (!input.sceneReady) {
    return { ready: false, reason: "씬을 준비하는 중입니다." };
  }
  if (input.presentationCount <= 0) {
    return { ready: false, reason: "사진을 업로드해 주세요." };
  }

  const wantsBackdrop =
    input.catalog.backgroundMediaSource !== "none" && Boolean(input.backdropMediaPath);
  if (wantsBackdrop) {
    const live = resolveShowcaseExportBackdropElement(input.backdropSource);
    if (!isShowcaseExportPreviewBackdropReady(live)) {
      return { ready: false, reason: "배경 영상 로딩 중… 미리보기에 배경이 보일 때 export 가능합니다." };
    }
  }

  return { ready: true, reason: null };
}
