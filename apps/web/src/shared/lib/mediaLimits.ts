import type { ProcessedImage } from "../types";
import { orderImagesForSceneContinuity } from "./sceneContinuity";

/** Shared 1 GB cap for 3D playback payload and IndexedDB vault blobs (per browser origin). */
export const MAX_PRESENTATION_BYTES = 1_024 * 1_024 * 1_024;
export const MAX_VAULT_BYTES = MAX_PRESENTATION_BYTES;

export function estimateDataUrlBytes(dataUrl: string): number {
  const commaIndex = dataUrl.indexOf(",");
  const base64 = commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl;
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

export function getPresentationImageBytes(image: ProcessedImage): number {
  return image.byteSize ?? estimateDataUrlBytes(image.url);
}

export function getPresentationTotalBytes(images: ProcessedImage[]): number {
  return images.reduce((total, image) => total + getPresentationImageBytes(image), 0);
}

export function formatPresentationBytes(bytes: number): string {
  if (bytes >= MAX_PRESENTATION_BYTES) {
    return "1.0 GB";
  }
  if (bytes >= 1_024 * 1_024) {
    return `${(bytes / (1_024 * 1_024)).toFixed(1)} MB`;
  }
  if (bytes >= 1_024) {
    return `${(bytes / 1_024).toFixed(1)} KB`;
  }
  return `${bytes} B`;
}

export function sortPresentationImages(images: ProcessedImage[]): ProcessedImage[] {
  return [...images].sort((left, right) => {
    const leftOrder = left.sequenceOrder ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = right.sequenceOrder ?? Number.MAX_SAFE_INTEGER;
    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }
    return left.id - right.id;
  });
}

export function constrainPresentationImages(images: ProcessedImage[]): ProcessedImage[] {
  const sorted = orderImagesForSceneContinuity(images);
  const selected: ProcessedImage[] = [];
  let totalBytes = 0;

  for (const image of sorted) {
    const imageBytes = getPresentationImageBytes(image);
    if (totalBytes + imageBytes > MAX_PRESENTATION_BYTES) {
      break;
    }
    selected.push(image);
    totalBytes += imageBytes;
  }

  return selected;
}

export function canAddPresentationImage(
  images: ProcessedImage[],
  nextImageBytes: number
): boolean {
  return getPresentationTotalBytes(images) + nextImageBytes <= MAX_PRESENTATION_BYTES;
}

const IMAGE_URL_FIELDS = [
  "url",
  "preparedUrl",
  "originalUrl",
  "preCropSourceUrl",
  "backgroundPlateUrl",
] as const;

export function estimateUniqueImageBlobBytes(image: ProcessedImage): number {
  const seen = new Set<string>();
  let total = 0;

  for (const field of IMAGE_URL_FIELDS) {
    const value = image[field];
    if (!value || seen.has(value)) {
      continue;
    }
    seen.add(value);
    total += image.byteSize ?? estimateDataUrlBytes(value);
  }

  return total;
}

export function estimateVaultPayloadBytes(images: ProcessedImage[]): number {
  return images.reduce((total, image) => total + estimateUniqueImageBlobBytes(image), 0);
}

export function canFitVaultPayload(
  usageBytes: number,
  nextPayloadBytes: number,
  limitBytes: number = MAX_VAULT_BYTES
): boolean {
  return usageBytes + nextPayloadBytes <= limitBytes;
}
