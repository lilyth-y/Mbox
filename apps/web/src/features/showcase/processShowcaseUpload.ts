import type { ProcessedImage } from "../../shared/types";

import { processUploadedImages } from "../processing/processImage";

import { applyBackgroundRemovalBatch } from "../processing/applyBackgroundRemoval";

import { processShowcaseQuickUpload } from "./processShowcaseQuickUpload";
import { isShowcaseAutomationSession } from "./showcaseAutomation";
import { isLocalGpuSession } from "../../shared/lib/gpuSession";



export type ProcessShowcaseUploadOptions = {

  applyBackgroundRemoval: boolean;

  onStatus?: (message: string) => void;

};



export type ProcessShowcaseUploadResult = {

  /** Immediate local preview (no cloud wait). */

  preview: ProcessedImage[];

  /** Cloud refine — resolves when /analyze finishes (or preview on failure). */

  refinement: Promise<ProcessedImage[]>;

  usedCloud: boolean;

};



/** Cloud Run `/analyze` — off on localhost / localOnly / VITE_SHOWCASE_LOCAL_ONLY. */
export function shouldTryCloudAnalyze(): boolean {
  if (isLocalGpuSession()) {
    return false;
  }
  if (typeof window !== "undefined") {
    const search = new URLSearchParams(window.location.search);
    if (search.get("localOnly") === "1") {
      return false;
    }
  }
  if (isShowcaseAutomationSession()) {
    return false;
  }
  return import.meta.env.VITE_SHOWCASE_LOCAL_ONLY !== "true";
}



async function applyOptionalBackgroundRemoval(

  images: ProcessedImage[],

  enabled: boolean,

  onStatus?: (message: string) => void

): Promise<ProcessedImage[]> {

  if (!enabled) {

    return images;

  }

  onStatus?.("배경 제거 중… (브라우저에서 처리)");

  return applyBackgroundRemovalBatch(images, { onStatus });

}



async function refineWithCloudAnalyze(

  sourceImages: string[],

  preview: ProcessedImage[],

  options: ProcessShowcaseUploadOptions

): Promise<ProcessedImage[]> {

  const { applyBackgroundRemoval, onStatus } = options;

  try {

    onStatus?.("클라우드 AI 분석 중… (백그라운드)");

    const processed = await processUploadedImages(sourceImages, {

      preprocessMode: applyBackgroundRemoval ? "background_removed" : "original",

      onStatus,

    });

    return applyOptionalBackgroundRemoval(processed, applyBackgroundRemoval, onStatus);

  } catch {

    return preview;

  }

}



/**

 * Instant preview + optional background cloud refine.

 */

export async function processShowcaseUpload(

  sourceImages: string[],

  options: ProcessShowcaseUploadOptions

): Promise<ProcessShowcaseUploadResult> {

  const preview = await processShowcaseQuickUpload(sourceImages);



  if (!shouldTryCloudAnalyze()) {

    const images = await applyOptionalBackgroundRemoval(

      preview,

      options.applyBackgroundRemoval,

      options.onStatus

    );

    return { preview: images, refinement: Promise.resolve(images), usedCloud: false };

  }



  const refinement = refineWithCloudAnalyze(sourceImages, preview, options);

  return { preview, refinement, usedCloud: true };

}


