import {
  ShowcaseVideoRecorder,
  downloadBlob,
  looksLikeIsoMp4,
  normalizeRecordingBlob,
  RECORD_ENCODER_FLUSH_MS,
  resolveRecordingMimeType,
} from "./export/showcaseRecorder";

import { startBgmRecordingSession } from "./export/compositeStreamWithBgm";

import type { ShowcasePhysicsSceneHandle } from "./babylon/createShowcasePhysicsScene";
import { resolveShowcaseGpuBudget } from "./showcaseGpuProfile";

import {

  CLOUD_SHOWCASE_PIPELINE_CONFIG,

  DEFAULT_SHOWCASE_PIPELINE_CONFIG,

  WEDDING_LUXURY_EXPORT_PIPELINE_CONFIG,

  WEDDING_LUXURY_FAST_EXPORT_PIPELINE_CONFIG,

  cloneShowcasePipelineConfig,

  type ShowcasePipelineConfig,

} from "./pipeline";
import {
  isCloudFastCrystalExport,
  isLocalGpuExportSession,
  isRenderWorkerExportSession,
  resolveCrystalExportProfile,
} from "../../shared/lib/renderExportProfile";

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
  publishRenderWorkerBlob,
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



  const images = Math.max(1, imageCount);

  const contentMs = images > 1 ? cycleMs * images : cycleMs;

  return contentMs + RECORD_ENCODER_FLUSH_MS;

}

export function resolveShowcaseExportImageCount(
  imageCount: number,
  catalog?: Pick<ShowcaseCatalogOptions, "cubePerFacePhotos">
): number {
  const cubePerFace =
    catalog?.cubePerFacePhotos ??
    (typeof window !== "undefined" &&
      (window as unknown as { __MBOX_CUBE_PER_FACE__?: boolean }).__MBOX_CUBE_PER_FACE__ ===
        true);
  return cubePerFace ? 1 : imageCount;
}

function resolveShowcaseExportPipelineConfig(options: {
  cloudFast: boolean;
  weddingLuxury: boolean;
  fastExport: boolean;
}): ShowcasePipelineConfig {
  if (options.weddingLuxury) {
    return cloneShowcasePipelineConfig(
      options.fastExport
        ? WEDDING_LUXURY_FAST_EXPORT_PIPELINE_CONFIG
        : WEDDING_LUXURY_EXPORT_PIPELINE_CONFIG
    );
  }
  if (options.cloudFast) {
    return cloneShowcasePipelineConfig(CLOUD_SHOWCASE_PIPELINE_CONFIG);
  }
  return cloneShowcasePipelineConfig(DEFAULT_SHOWCASE_PIPELINE_CONFIG);
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

  exportSize?: number;

  filename?: string;

  catalog: ShowcaseCatalogOptions;

  backdropMediaPath?: string | null;

  backdropElement?: HTMLVideoElement | HTMLImageElement | null;

  backdropOpacity?: number;

  backgroundPreset?: ShowcaseBackgroundPreset;

  /** Preview viewport wrap — export size/framing follow on-screen layout. */
  viewportElement?: HTMLElement | null;

  bgmUrl?: string | null;

  bgmVolume?: number;

};



export type ShowcaseExportVideoResult = {

  blob: Blob;

  filename: string;

};



export async function exportShowcaseMp4(

  handle: ShowcasePhysicsSceneHandle,

  options: ShowcaseExportVideoOptions

): Promise<ShowcaseExportVideoResult> {

  const profile = resolveCrystalExportProfile();
  const cloudFast = profile ? isCloudFastCrystalExport(profile) : false;
  const localGpu = isLocalGpuExportSession();
  const workerExport = isRenderWorkerExportSession();
  const e2eExport =
    typeof window !== "undefined" &&
    (window as unknown as { __MBOX_E2E_EXPORT__?: boolean }).__MBOX_E2E_EXPORT__ === true;
  const fastExport =
    typeof window !== "undefined" &&
    (window as unknown as { __MBOX_FAST_EXPORT__?: boolean }).__MBOX_FAST_EXPORT__ === true;
  const weddingLuxury =
    typeof window !== "undefined" &&
    (window as unknown as { __MBOX_WEDDING_LUXURY_EXPORT__?: boolean })
      .__MBOX_WEDDING_LUXURY_EXPORT__ === true;
  const e2ePaceFps = Number(
    (window as unknown as { __MBOX_E2E_PACE_FPS__?: number }).__MBOX_E2E_PACE_FPS__ ?? 12
  );
  const useWallClockCapture = false;
  const usePacedExport = (localGpu || workerExport) && !fastExport;
  const pipelineConfig = resolveShowcaseExportPipelineConfig({
    cloudFast,
    weddingLuxury,
    fastExport,
  });
  const exportImageCount = resolveShowcaseExportImageCount(
    options.imageCount,
    options.catalog
  );

  const outputSize = resolveShowcaseExportOutputSize(
    profile?.width ?? options.exportSize
  );
  const gpuBudget = resolveShowcaseGpuBudget();
  const simplified = gpuBudget.tier === "simplified";
  const renderSize = resolveShowcaseRenderSize(outputSize, {
    cloudFast,
    simplified: false,
  });
  const exportFps = localGpu
    ? 30
    : e2eExport && !localGpu
      ? Math.max(8, Math.min(24, e2ePaceFps))
      : simplified
        ? gpuBudget.exportFps
        : profile?.fps ?? SHOWCASE_EXPORT_FPS;
  const encodeBitrate =
    profile?.videoBitrate ?? resolveShowcaseEncodeBitrate(outputSize);

  const durationMs = computeShowcaseExportDurationMs(
    exportImageCount,
    pipelineConfig
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
  if (!localGpu) {
    handle.applySafeGpuRecovery();
  }

  const recorder = new ShowcaseVideoRecorder();
  let composite: ReturnType<typeof createShowcaseExportCompositeStream> | null = null;
  let bgmSession: Awaited<ReturnType<typeof startBgmRecordingSession>> | null = null;

  try {
    handle.director.reset();

    handle.setPlaying(true);

    handle.enterExportCompositeMode(options.catalog);

    if (wantsBackdrop && backdropMediaPath) {
      if (!e2eExport) {
        exportBackdrop = await resolveShowcasePreviewExportBackdrop(backdropMediaPath, backdrop);
      }

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

    await syncExportBackdropTimeline([compositeBackdrop]);
    await warmShowcaseExportBackdrop(exportBackdrop);
    await warmBackdropVideo(compositeBackdrop);

    handle.applyExportViewport(renderSize, {
      preserveCameraRadius: true,
      cameraRadius: layout.cameraRadius,
    });

    handle.setExportCadenceFps(exportFps);

    await waitFrames(localGpu ? 36 : cloudFast ? 8 : simplified ? 12 : 24);

    await new Promise<void>((resolve) =>
      window.setTimeout(
        resolve,
        localGpu ? 1500 : cloudFast ? 280 : simplified ? 400 : 720
      )
    );

    const contentMs = durationMs - RECORD_ENCODER_FLUSH_MS;

    const bgmUrl = options.bgmUrl ?? null;
    const withAudio = Boolean(bgmUrl) && !window.__MBOX_E2E_EXPORT__;

    const { mimeType, extension } = resolveRecordingMimeType({ withAudio });

    const sceneCanvas = handle.getCanvas();

    composite = createShowcaseExportCompositeStream({

      sceneCanvas,

      backdrop: compositeBackdrop,

      backdropOpacity,

      fallbackColor,

      size: outputSize,

      fps: exportFps,

      manualCapture: usePacedExport,

      fixedCadence: !useWallClockCapture,

      wallClockCapture: useWallClockCapture,

      onAfterRender: (paint) => handle.onAfterRender(paint),

    });

    const stream = composite.stream;
    const [videoTrack] = stream.getVideoTracks();
    if (videoTrack) {
      await videoTrack.applyConstraints({ frameRate: exportFps }).catch(() => undefined);
    }

    if (withAudio && bgmUrl) {
      bgmSession = await startBgmRecordingSession({
        videoStream: stream,
        audioUrl: bgmUrl,
        durationMs,
        volume: options.bgmVolume ?? 0.85,
        holdUntilExportDone: true,
      });
    }

    const recordStream = bgmSession?.compositeStream ?? stream;

    await waitFrames(4);

    const previewFingerprint = captureShowcaseExportPreviewFingerprint({
      sceneCanvas,
      backdrop: compositeBackdrop,
      backdropOpacity,
      fallbackColor,
      size: outputSize,
    });

    recorder.start(recordStream, mimeType, encodeBitrate);

    const contentFrames = Math.ceil((contentMs * exportFps) / 1000);
    const pacedRecordTimeoutMs = Math.max(
      180_000,
      Math.ceil((contentFrames / exportFps) * (usePacedExport && !localGpu ? 4_500 : 2_500))
    );

    if (usePacedExport) {
      composite.beginRecording();
      await handle.recordPacedExportFrames(contentFrames, exportFps);
      await composite.waitForRecordedFrames(contentFrames, pacedRecordTimeoutMs);
    } else {
      await new Promise<void>((resolve) => window.setTimeout(resolve, contentMs));
    }

    await new Promise<void>((resolve) => window.setTimeout(resolve, RECORD_ENCODER_FLUSH_MS));

    let blob = normalizeRecordingBlob(await recorder.stop(), extension);

    bgmSession?.stop();

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
      durationToleranceSec: e2eExport
        ? Math.max(12, expectedDurationSec * 0.45)
        : Math.max(2.5, expectedDurationSec * 0.18),
      minCenterLuma: e2eExport ? 6 : undefined,
      minFileBytes: e2eExport ? 48_000 : undefined,
      previewFingerprint,
    });

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

    await publishRenderWorkerBlob(blob);

    if (!verification.passed) {
      if (e2eExport) {
        console.warn(
          "[showcase] E2E export verification warnings:",
          verification.errors.join("; ")
        );
      } else {
        throw new ShowcaseExportError(verification.errors.join(" "));
      }
    }

    downloadBlob(blob, filename);

    return { blob, filename };
  } finally {
    bgmSession?.stop();
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

