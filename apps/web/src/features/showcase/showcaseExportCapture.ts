import {

  CubeVideoRecorder,

  downloadBlob,

  looksLikeIsoMp4,

  normalizeRecordingBlob,

  RECORD_ENCODER_FLUSH_MS,

  resolveRecordingMimeType,

} from "../cube/cubeRecorder";

import type { ShowcasePhysicsSceneHandle } from "./babylon/createShowcasePhysicsScene";

import {

  DEFAULT_SHOWCASE_PIPELINE_CONFIG,

  type ShowcasePipelineConfig,

} from "./pipeline";

import { getShowcasePresetCssColor } from "./babylon/showcasePresetBackdrop";

import type { ShowcaseBackgroundPreset } from "./babylon/weddingChapelEnvironment";

import type { ShowcaseCatalogOptions } from "./showcaseCatalogOptions";

import {
  isShowcaseExportPreviewBackdropReady,
  resolveLiveShowcaseDomBackdrop,
  resolveShowcasePreviewExportBackdrop,
  syncExportBackdropTimeline,
  warmShowcaseExportBackdrop,
  type ShowcaseExportBackdropHandle,
} from "./showcaseExportBackdrop";

import { createShowcaseExportCompositeStream } from "./showcaseExportCompositeStream";
import { captureShowcaseExportPreviewFingerprint } from "./showcaseExportWysiwyg";
import {
  resolveShowcaseEncodeBitrate,
  resolveShowcaseExportOutputSize,
  resolveShowcaseRenderSize,
  SHOWCASE_EXPORT_FPS,
} from "./showcaseExportSpecs";
import {
  publishShowcaseExportE2ePayload,
  verifyShowcaseExportBlob,
} from "./showcaseExportVerification";

export class ShowcaseExportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ShowcaseExportError";
  }
}

function assertShowcaseExportBackdropReady(
  wantsBackdrop: boolean,
  compositeBackdrop: HTMLVideoElement | HTMLImageElement | null,
  inSceneExportBackdrop: boolean
): void {
  if (!wantsBackdrop) {
    return;
  }
  if (isShowcaseExportPreviewBackdropReady(compositeBackdrop)) {
    return;
  }
  if (inSceneExportBackdrop) {
    return;
  }
  throw new ShowcaseExportError(
    "배경 영상을 불러올 수 없습니다. 미리보기에서 배경이 보이는지 확인한 뒤 다시 시도해 주세요."
  );
}



export function computeShowcaseExportDurationMs(

  imageCount: number,

  fallPhysicsEnabled: boolean,

  config: ShowcasePipelineConfig = DEFAULT_SHOWCASE_PIPELINE_CONFIG

): number {

  const lead = config.pullSpinLeadMs;

  const zoomStartMs = lead * config.pullZoomLeadOverlap;

  const zoomDuration = lead - zoomStartMs + config.pullDurationMs;

  const pullMs = zoomStartMs + zoomDuration + config.pullHoldMs;



  let cycleMs =

    config.revealHoldMs +

    config.rotateDurationMs +

    config.morphDurationMs +

    pullMs +

    config.pullReturnMs;



  if (fallPhysicsEnabled) {

    cycleMs += config.fallMaxMs + config.settleHoldMs + 1_200;

  }



  const images = Math.max(1, imageCount);

  const contentMs = images > 1 ? cycleMs * images : cycleMs;

  return contentMs + RECORD_ENCODER_FLUSH_MS;

}



async function waitFrames(count: number): Promise<void> {

  for (let i = 0; i < count; i++) {

    await new Promise<void>((resolve) => {

      requestAnimationFrame(() => resolve());

    });

  }

}



async function warmBackdropVideo(

  backdrop: HTMLVideoElement | HTMLImageElement | null

): Promise<void> {

  if (!backdrop || !(backdrop instanceof HTMLVideoElement)) {

    return;

  }

  try {

    if (backdrop.paused) {

      await backdrop.play();

    }

  } catch {

    /* autoplay policy — still try to sample current frame */

  }

  if (backdrop.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {

    await new Promise<void>((resolve) => {

      const done = () => {

        backdrop.removeEventListener("loadeddata", done);

        resolve();

      };

      backdrop.addEventListener("loadeddata", done, { once: true });

      window.setTimeout(done, 2_000);

    });

  }

}



export type ShowcaseExportVideoOptions = {

  imageCount: number;

  fallPhysicsEnabled: boolean;

  exportSize?: number;

  filename?: string;

  catalog: ShowcaseCatalogOptions;

  backdropMediaPath?: string | null;

  backdropElement?: HTMLVideoElement | HTMLImageElement | null;

  backdropOpacity?: number;

  backgroundPreset?: ShowcaseBackgroundPreset;

  /** Preview viewport wrap — export size/framing follow on-screen layout. */
  viewportElement?: HTMLElement | null;

};



export type ShowcaseExportVideoResult = {

  blob: Blob;

  filename: string;

};



export async function exportShowcaseMp4(

  handle: ShowcasePhysicsSceneHandle,

  options: ShowcaseExportVideoOptions

): Promise<ShowcaseExportVideoResult> {

  const outputSize = resolveShowcaseExportOutputSize(options.exportSize);
  const renderSize = resolveShowcaseRenderSize(outputSize);

  const durationMs = computeShowcaseExportDurationMs(
    options.imageCount,
    options.fallPhysicsEnabled
  );

  const baseName = options.filename ?? "mbox-showcase";

  const wantsBackdrop =
    options.catalog.backgroundMediaSource !== "none" && Boolean(options.backdropMediaPath);

  let backdrop = resolveLiveShowcaseDomBackdrop(options.backdropElement ?? null);

  const layout = handle.snapshotViewportLayout();

  await syncExportBackdropTimeline([backdrop]);

  const backdropOpacity = options.backdropOpacity ?? 1;

  const backdropMediaPath = options.backdropMediaPath ?? null;

  const fallbackColor = getShowcasePresetCssColor(options.backgroundPreset ?? "booth");

  let exportBackdrop: ShowcaseExportBackdropHandle | null = null;
  let inSceneExportBackdrop = false;

  handle.setExportRecording(true);

  const recorder = new CubeVideoRecorder();
  let composite: ReturnType<typeof createShowcaseExportCompositeStream> | null = null;

  try {
    handle.director.reset();

    handle.setPlaying(true);

    handle.enterExportCompositeMode(options.catalog);

    if (wantsBackdrop && backdropMediaPath) {
      exportBackdrop = await resolveShowcasePreviewExportBackdrop(backdropMediaPath, backdrop);

      if (!exportBackdrop?.source) {
        try {
          inSceneExportBackdrop = await handle.mountExportMediaBackdrop(options.catalog, backdrop);
          handle.enterExportCompositeMode(options.catalog, { preserveInSceneBackdrop: true });
        } catch (error) {
          console.warn("[showcase] export in-scene url backdrop failed", error);
        }
      }
    }

    const compositeBackdrop =
      exportBackdrop?.source ??
      (isShowcaseExportPreviewBackdropReady(backdrop) ? backdrop : null);

    assertShowcaseExportBackdropReady(wantsBackdrop, compositeBackdrop, inSceneExportBackdrop);

    handle.applyExportViewport(renderSize, {
      preserveCameraRadius: true,
      cameraRadius: layout.cameraRadius,
    });

    await syncExportBackdropTimeline([compositeBackdrop]);
    await warmShowcaseExportBackdrop(exportBackdrop);
    await warmBackdropVideo(compositeBackdrop);

    await waitFrames(24);

    await new Promise<void>((resolve) => window.setTimeout(resolve, 720));

    const contentMs = durationMs - RECORD_ENCODER_FLUSH_MS;

    const { mimeType, extension } = resolveRecordingMimeType({ withAudio: false });

    const sceneCanvas = handle.getCanvas();

    composite = createShowcaseExportCompositeStream({

      sceneCanvas,

      backdrop: compositeBackdrop,

      backdropOpacity,

      fallbackColor,

      size: outputSize,

      fps: SHOWCASE_EXPORT_FPS,

      fixedCadence: true,

      onAfterRender: (paint) => handle.onAfterRender(paint),

    });

    const stream = composite.stream;
    const [videoTrack] = stream.getVideoTracks();
    if (videoTrack) {
      await videoTrack.applyConstraints({ frameRate: SHOWCASE_EXPORT_FPS }).catch(() => undefined);
    }

    await waitFrames(4);

    const previewFingerprint = captureShowcaseExportPreviewFingerprint({
      sceneCanvas,
      backdrop: compositeBackdrop,
      backdropOpacity,
      fallbackColor,
      size: outputSize,
    });

    recorder.start(stream, mimeType, resolveShowcaseEncodeBitrate(outputSize));

    await new Promise<void>((resolve) => window.setTimeout(resolve, contentMs));

    await new Promise<void>((resolve) => window.setTimeout(resolve, RECORD_ENCODER_FLUSH_MS));

    let blob = normalizeRecordingBlob(await recorder.stop(), extension);

    let outExtension = extension;

    if (extension === "mp4" && !(await looksLikeIsoMp4(blob))) {

      outExtension = "webm";

      blob = normalizeRecordingBlob(blob, "webm");

    }

    const expectedDurationSec = contentMs / 1000;
    const verification = await verifyShowcaseExportBlob(blob, {
      expectedWidth: outputSize,
      expectedHeight: outputSize,
      expectedDurationSec,
      durationToleranceSec: Math.max(2.5, expectedDurationSec * 0.18),
      previewFingerprint,
    });

    if (!verification.passed) {
      throw new ShowcaseExportError(verification.errors.join(" "));
    }

    const filename = `${baseName}.${outExtension}`;

    publishShowcaseExportE2ePayload({
      bytes: blob.size,
      filename,
      mimeType: blob.type,
      verification,
      contentManifest: {
        ...handle.director.getContentManifest(),
        exportedAt: new Date().toISOString(),
      },
    });

    downloadBlob(blob, filename);

    return { blob, filename };
  } finally {
    composite?.dispose();

    exportBackdrop?.dispose();

    if (inSceneExportBackdrop) {
      handle.unmountExportMediaBackdrop(options.catalog);
    }

    handle.exitExportCompositeMode(options.catalog);

    handle.setExportRecording(false);

    handle.restoreViewportLayout(layout);
  }
}

