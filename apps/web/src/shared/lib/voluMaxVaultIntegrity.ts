import {
  isVoluMaxCutoutReady,
  isVoluMaxLayerReady,
  isTransparentMatteDataUrl,
  resolveCubeFaceDisplayUrl,
  resolveVoluMaxForegroundKind,
} from "@mbox/shared";
import type { ProcessedImage } from "../types";

export type VoluMaxVaultIssueKind =
  | "missing_subject_fg"
  | "missing_bg_plate"
  | "stale_prepared"
  | "stale_ai_cutout_kind";

export interface VoluMaxVaultAuditEntry {
  imageId: number;
  label: string;
  issue: VoluMaxVaultIssueKind;
  detail: string;
}

function faceLabel(image: ProcessedImage, index: number): string {
  const trimmed = image.label?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : `면 ${index + 1}`;
}

/** Detect VoluMax metadata / URL mismatches after vault load. */
export function auditVoluMaxVaultIntegrity(images: ProcessedImage[]): VoluMaxVaultAuditEntry[] {
  const entries: VoluMaxVaultAuditEntry[] = [];

  images.forEach((image, index) => {
    const label = faceLabel(image, index);
    const kind = resolveVoluMaxForegroundKind(image);
    const layerReady = isVoluMaxLayerReady(image);
    const cutoutReady = isVoluMaxCutoutReady(image);

    if (image.voluMaxPrepared && !layerReady) {
      entries.push({
        imageId: image.id,
        label,
        issue: "stale_prepared",
        detail: "voluMaxPrepared=true 이지만 전경/배경 레이어 URL이 없거나 손상됨",
      });
    }

    if (kind === "ai_cutout" && !cutoutReady) {
      entries.push({
        imageId: image.id,
        label,
        issue: "stale_ai_cutout_kind",
        detail: "AI 누끼로 표시됐지만 투명 전경 matte URL이 없음",
      });
    }

    if (layerReady && !image.subjectForegroundUrl) {
      entries.push({
        imageId: image.id,
        label,
        issue: "missing_subject_fg",
        detail: "레이어는 준비된 것으로 보이지만 subjectForegroundUrl 필드가 비어 있음",
      });
    }

    if (
      (image.voluMaxPrepared || kind !== "none") &&
      !image.backgroundPlateUrl
    ) {
      entries.push({
        imageId: image.id,
        label,
        issue: "missing_bg_plate",
        detail: "VoluMax 메타는 있으나 backgroundPlateUrl이 없음",
      });
    }
  });

  return entries;
}

/** Clear stale VoluMax flags so auto-prepare can rebuild missing layers. */
export function repairLoadedVaultImages(images: ProcessedImage[]): ProcessedImage[] {
  return images.map((image) => {
    const layerReady = isVoluMaxLayerReady(image);
    const cutoutReady = isVoluMaxCutoutReady(image);
    const kind = resolveVoluMaxForegroundKind(image);

    if (!image.voluMaxPrepared && layerReady && cutoutReady) {
      return image;
    }

    let next = image;

    if (image.voluMaxPrepared && !layerReady) {
      next = { ...next, voluMaxPrepared: false };
    }

    if (kind === "ai_cutout" && !cutoutReady) {
      next = {
        ...next,
        voluMaxForegroundKind: layerReady ? "soft_matte" : "none",
        voluMaxPrepared: layerReady ? next.voluMaxPrepared : false,
      };
    }

    if (
      next.preprocessMode === "volumax" &&
      !isVoluMaxLayerReady(next)
    ) {
      next = { ...next, preprocessMode: "original" };
    }

    const displayUrl = resolveCubeFaceDisplayUrl(next);
    if (next.url !== displayUrl && isTransparentMatteDataUrl(next.url)) {
      next = {
        ...next,
        url: displayUrl,
        preparedUrl: next.preparedUrl && !isTransparentMatteDataUrl(next.preparedUrl)
          ? next.preparedUrl
          : displayUrl,
      };
    }

    if (
      next.subjectForegroundUrl &&
      isTransparentMatteDataUrl(next.subjectForegroundUrl) &&
      !next.backgroundPlateUrl
    ) {
      next = {
        ...next,
        voluMaxPrepared: false,
        voluMaxForegroundKind:
          next.voluMaxForegroundKind === "ai_cutout" ? "none" : next.voluMaxForegroundKind,
        preprocessMode: next.preprocessMode === "volumax" ? "original" : next.preprocessMode,
      };
    }

    return next;
  });
}

export function vaultImagesNeedRepair(
  before: ProcessedImage[],
  after: ProcessedImage[]
): boolean {
  if (before.length !== after.length) {
    return true;
  }
  return before.some((image, index) => {
    const repaired = after[index];
    return (
      image.voluMaxPrepared !== repaired.voluMaxPrepared ||
      image.voluMaxForegroundKind !== repaired.voluMaxForegroundKind ||
      image.preprocessMode !== repaired.preprocessMode
    );
  });
}

export function needsInlineVoluMaxBlobMigration(image: ProcessedImage): boolean {
  return Boolean(
    image.subjectForegroundUrl?.startsWith("data:") ||
      image.faceCompositeUrl?.startsWith("data:")
  );
}

export function formatVoluMaxVaultAuditMessage(entries: VoluMaxVaultAuditEntry[]): string {
  if (entries.length === 0) {
    return "";
  }
  const labels = [...new Set(entries.map((entry) => entry.label))];
  return `VoluMax 레이어 URL 누락 감지 (${labels.join(", ")}). AI 누끼 재준비가 필요합니다.`;
}
