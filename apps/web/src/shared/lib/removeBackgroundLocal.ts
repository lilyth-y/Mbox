import type { ImglySegmentationModel } from "@mbox/shared";
import {
  removeBackgroundWithImgly,
  type BackgroundRemovalProgressHandler,
} from "./backgroundRemovalEngine";

export interface LocalBackgroundRemovalResult {
  imageBase64: string;
  mimeType: string;
  model: ImglySegmentationModel;
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

export {
  preloadBackgroundRemovalEngine,
  type BackgroundRemovalProgressHandler,
} from "./backgroundRemovalEngine";

export async function removeBackgroundLocal(
  sourceDataUrl: string,
  onProgress?: BackgroundRemovalProgressHandler
): Promise<LocalBackgroundRemovalResult> {
  const { blob, model } = await removeBackgroundWithImgly(sourceDataUrl, onProgress);

  return {
    imageBase64: await blobToBase64(blob),
    mimeType: "image/png",
    model,
  };
}
