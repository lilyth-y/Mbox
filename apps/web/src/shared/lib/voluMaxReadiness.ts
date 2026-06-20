import {
  isVoluMaxCutoutReady,
  isVoluMaxLayerReady,
  resolveVoluMaxForegroundKind,
} from "@mbox/shared";
import type { ProcessedImage } from "../types";

export type VoluMaxFaceStatus =
  | "cutout_ready"
  | "soft_matte_only"
  | "plate_only"
  | "missing_layers";

function faceLabel(image: ProcessedImage, index: number): string {
  const trimmed = image.label?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : `면 ${index + 1}`;
}

export function classifyVoluMaxFace(image: ProcessedImage): VoluMaxFaceStatus {
  if (isVoluMaxCutoutReady(image)) {
    return "cutout_ready";
  }
  if (isVoluMaxLayerReady(image)) {
    return resolveVoluMaxForegroundKind(image) === "soft_matte"
      ? "soft_matte_only"
      : "plate_only";
  }
  if (image.backgroundPlateUrl) {
    return "plate_only";
  }
  return "missing_layers";
}

export interface VoluMaxReadinessSummary {
  total: number;
  cutoutReady: number;
  softMatteOnlyLabels: string[];
  plateOnlyLabels: string[];
  missingLayersLabels: string[];
}

export function summarizeVoluMaxReadiness(images: ProcessedImage[]): VoluMaxReadinessSummary {
  const softMatteOnlyLabels: string[] = [];
  const plateOnlyLabels: string[] = [];
  const missingLayersLabels: string[] = [];
  let cutoutReady = 0;

  images.forEach((image, index) => {
    const label = faceLabel(image, index);
    switch (classifyVoluMaxFace(image)) {
      case "cutout_ready":
        cutoutReady += 1;
        break;
      case "soft_matte_only":
        softMatteOnlyLabels.push(label);
        break;
      case "plate_only":
        plateOnlyLabels.push(label);
        break;
      case "missing_layers":
        missingLayersLabels.push(label);
        break;
    }
  });

  return {
    total: images.length,
    cutoutReady,
    softMatteOnlyLabels,
    plateOnlyLabels,
    missingLayersLabels,
  };
}

export function formatVoluMaxPrepareMessage(summary: VoluMaxReadinessSummary): string {
  const { cutoutReady, total, softMatteOnlyLabels, plateOnlyLabels, missingLayersLabels } =
    summary;
  if (total === 0) {
    return "VoluMax 레이어를 준비할 사진이 없습니다.";
  }
  if (cutoutReady === total) {
    return `VoluMax 레이어 준비 완료 (${cutoutReady}/${total}면 · AI 누끼).`;
  }

  const parts = [`VoluMax AI 누끼 ${cutoutReady}/${total}면`];
  if (softMatteOnlyLabels.length > 0) {
    parts.push(`사각 matte만(시차 미적용): ${softMatteOnlyLabels.join(", ")}`);
  }
  if (plateOnlyLabels.length > 0) {
    parts.push(`배경 plate만: ${plateOnlyLabels.join(", ")}`);
  }
  if (missingLayersLabels.length > 0) {
    parts.push(`미준비: ${missingLayersLabels.join(", ")}`);
  }
  return parts.join(" · ");
}

export function formatVoluMaxOneClickMessage(summary: VoluMaxReadinessSummary): string {
  if (summary.cutoutReady === 0) {
    if (summary.softMatteOnlyLabels.length > 0) {
      return `AI 누끼 실패 — 사각 soft matte만 생성됨 (${summary.softMatteOnlyLabels.join(", ")}). 「인물 AI 누끼」를 켜고 다시 실행하세요.`;
    }
    return "VoluMax 레이어를 만들지 못했습니다. 사진 URL·분석(인물 bounds)을 확인한 뒤 다시 시도하세요.";
  }

  const failLabels = [...summary.softMatteOnlyLabels, ...summary.missingLayersLabels];
  const base = `VoluMax 원클릭 완료 (${summary.cutoutReady}/${summary.total}면 AI 누끼 · 깊이 ON). 정면 정지 구간에서 시차를 확인하세요.`;
  if (failLabels.length === 0) {
    return base;
  }
  return `${base} 시차 미적용 면: ${failLabels.join(", ")}.`;
}
