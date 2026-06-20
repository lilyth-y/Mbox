import {
  DEFAULT_CUBE_PRESENTATION_OPTIONS,
  isTransparentMatteDataUrl,
  resolveCubeFaceDisplayUrl,
  resolveSubjectForegroundUrl,
  resolveVoluMaxForegroundKind,
  type VoluMaxForegroundKind,
} from "@mbox/shared";
import type { ProcessedImage } from "../../shared/types";
import { estimateDataUrlBytes } from "../../shared/lib/mediaLimits";
import {
  createBackgroundPlateDataUrl,
  createSubjectForegroundDataUrl,
  resolveBackgroundPlateRenderOptions,
  type BackgroundPlateTheme,
} from "../../shared/lib/backgroundPlate";
import { prepareBackgroundRemovalEngine } from "../../shared/lib/removeBackground";
import { buildAlignedVoluMaxAiLayers } from "../../shared/lib/voluMaxAiAlign";
import {
  resolveFaceCenterAndBounds,
} from "../../shared/lib/subjectBoundsCrop";

interface ApplyPresentationPrepareOptions {
  onStatus?: (message: string) => void;
  backgroundPlateTheme?: BackgroundPlateTheme;
  /** Browser AI cutout for VoluMax fg matte (same option as wedding-simple). */
  useAiForegroundCutout?: boolean;
  /** Rebuild plate + matte even when cached (one-click / crop-alignment fixes). */
  forceRegenerateLayers?: boolean;
}

interface ApplyPresentationPrepareBatchOptions extends ApplyPresentationPrepareOptions {
  onProgress?: (current: number, total: number, message: string) => void;
}

function resolveOriginalSourceUrl(image: ProcessedImage, faceTextureUrl: string): string {
  return image.preCropSourceUrl ?? image.originalUrl ?? faceTextureUrl;
}

/**
 * Prepares wedding/cube presentation without background removal (full photo on cube faces).
 */
export async function applyPresentationPrepare(
  image: ProcessedImage,
  options: ApplyPresentationPrepareOptions = {}
): Promise<ProcessedImage> {
  const onStatus = options.onStatus;
  const faceTextureUrl = image.url;
  const originalSourceUrl = resolveOriginalSourceUrl(image, faceTextureUrl);
  const plateTheme = options.backgroundPlateTheme ?? image.backgroundPlateTheme ?? "original";
  const { plateThemeForRender, plateBlurPx } = resolveBackgroundPlateRenderOptions(plateTheme);
  const existingFg = resolveSubjectForegroundUrl(image);
  const existingKind = resolveVoluMaxForegroundKind(image);
  const hasAiCutout =
    existingKind === "ai_cutout" && Boolean(existingFg && isTransparentMatteDataUrl(existingFg));
  const wantsAiCutout =
    options.useAiForegroundCutout ??
    DEFAULT_CUBE_PRESENTATION_OPTIONS.voluMaxAiForegroundCutout;
  const forceRegenerate = options.forceRegenerateLayers === true;
  let hasFgMatte = Boolean(existingFg && isTransparentMatteDataUrl(existingFg));
  /** Cached soft matte must not block a new AI cutout request. */
  if ((wantsAiCutout && !hasAiCutout) || forceRegenerate) {
    hasFgMatte = false;
  }

  /** AI 누끼 완료 이미지 — 원본에서 plate, 투명 PNG를 전경으로 사용. */
  if (image.preprocessMode === "background_removed") {
    onStatus?.(`[${image.label}] VoluMax 전경(누끼) + 원본 배경 plate 연결 중...`);
    const backgroundPlateUrl =
      !forceRegenerate &&
      image.backgroundPlateUrl &&
      image.backgroundPlateTheme === plateTheme
        ? image.backgroundPlateUrl
        : await createBackgroundPlateDataUrl(originalSourceUrl, {
            theme: plateThemeForRender,
            blurPx: plateBlurPx,
            center: image.center,
            focus: image.focus,
            subjectBounds: image.subject.bounds,
          });
    const subjectForegroundUrl = image.subjectForegroundUrl ?? faceTextureUrl;
    const matteReady = isTransparentMatteDataUrl(subjectForegroundUrl);
    const displayUrl = resolveCubeFaceDisplayUrl(image);
    return {
      ...image,
      url: displayUrl,
      preparedUrl: image.preparedUrl ?? displayUrl,
      backgroundPlateUrl,
      backgroundPlateTheme: plateTheme,
      subjectForegroundUrl,
      voluMaxForegroundKind: matteReady ? "ai_cutout" : image.voluMaxForegroundKind ?? "none",
      voluMaxPrepared: matteReady,
      preprocessMode: matteReady ? "volumax" : image.preprocessMode,
      byteSize:
        estimateDataUrlBytes(faceTextureUrl) +
        estimateDataUrlBytes(backgroundPlateUrl) +
        estimateDataUrlBytes(subjectForegroundUrl),
    };
  }

  onStatus?.(`[${image.label}] 연출용 텍스처 준비 중...`);
  const backgroundPlateUrl =
    !forceRegenerate &&
    image.backgroundPlateUrl &&
    image.backgroundPlateTheme === plateTheme
      ? image.backgroundPlateUrl
      : await createBackgroundPlateDataUrl(originalSourceUrl, {
          theme: plateThemeForRender,
          blurPx: plateBlurPx,
          center: image.center,
          focus: image.focus,
          subjectBounds: image.subject.bounds,
        });
  let subjectForegroundUrl = image.subjectForegroundUrl ?? faceTextureUrl;
  let fgMatteReady = hasFgMatte;
  let foregroundKind: VoluMaxForegroundKind = hasAiCutout
    ? "ai_cutout"
    : hasFgMatte
      ? "soft_matte"
      : "none";

  let subjectMatteSourceUrl = image.subjectMatteSourceUrl;

  if (!fgMatteReady && wantsAiCutout) {
    try {
      onStatus?.(`[${image.label}] VoluMax AI 누끼(인물 분리) 중...`);
      const aligned = await buildAlignedVoluMaxAiLayers(
        image,
        originalSourceUrl,
        image.center,
        image.focus,
        onStatus
      );
      subjectForegroundUrl = aligned.subjectForegroundUrl;
      subjectMatteSourceUrl = aligned.subjectMatteSourceUrl;
      fgMatteReady = subjectForegroundUrl.startsWith("data:image/png");
      if (fgMatteReady) {
        foregroundKind = "ai_cutout";
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      onStatus?.(`[${image.label}] AI 누끼 실패 — 소프트 matte로 대체 (${reason})`);
    }
  }

  const faceGeo = await resolveFaceCenterAndBounds(image);

  if (!fgMatteReady) {
    try {
      onStatus?.(`[${image.label}] 소프트 matte 폴백 적용 중...`);
      subjectForegroundUrl = await createSubjectForegroundDataUrl(faceTextureUrl, faceGeo.bounds);
      fgMatteReady = subjectForegroundUrl.startsWith("data:image/png");
      if (fgMatteReady) {
        foregroundKind = "soft_matte";
        onStatus?.(
          `[${image.label}] 소프트 matte만 적용됨 — 인물 AI 누끼를 켜고 다시 준비하면 VoluMax 시차가 극대화됩니다.`
        );
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      onStatus?.(`[${image.label}] 소프트 matte 실패 (${reason})`);
      subjectForegroundUrl = faceTextureUrl;
      fgMatteReady = false;
      foregroundKind = "none";
    }
  }

  const voluMaxPrepared =
    Boolean(backgroundPlateUrl) &&
    fgMatteReady &&
    foregroundKind === "ai_cutout" &&
    isTransparentMatteDataUrl(subjectForegroundUrl);

  const byteSize =
    estimateDataUrlBytes(faceTextureUrl) +
    estimateDataUrlBytes(backgroundPlateUrl) +
    estimateDataUrlBytes(subjectForegroundUrl);

  return {
    ...image,
    preparedUrl: image.preparedUrl ?? image.url,
    url: faceTextureUrl,
    center: faceGeo.center,
    backgroundPlateUrl,
    backgroundPlateTheme: plateTheme,
    subjectForegroundUrl,
    subjectMatteSourceUrl,
    voluMaxForegroundKind: foregroundKind,
    voluMaxPrepared,
    faceCompositeUrl: image.faceCompositeUrl ?? faceTextureUrl,
    preprocessMode: voluMaxPrepared ? "volumax" : image.preprocessMode,
    subject: { ...image.subject, bounds: faceGeo.bounds },
    depth: faceGeo.depth,
    byteSize,
  };
}

export async function applyPresentationPrepareBatch(
  images: ProcessedImage[],
  options: ApplyPresentationPrepareBatchOptions = {}
): Promise<ProcessedImage[]> {
  const total = images.length;
  const results: ProcessedImage[] = [];

  if (options.useAiForegroundCutout) {
    try {
      await prepareBackgroundRemovalEngine(options.onStatus);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      options.onStatus?.(`누끼 AI 모델 사전 로드 실패 — 개별 처리 시 재시도합니다. (${reason})`);
    }
  }

  for (let index = 0; index < images.length; index += 1) {
    const image = images[index];
    if (!image) {
      continue;
    }
    const message = `[${index + 1}/${total}] ${image.label} 연출 준비 중...`;
    options.onStatus?.(message);
    options.onProgress?.(index, total, message);
    results.push(await applyPresentationPrepare(image, options));
    options.onProgress?.(index + 1, total, `[${index + 1}/${total}] ${image.label} 완료`);
  }

  return results;
}

/** Bake theme plates for any image missing `backgroundPlateUrl` so cube faces never render empty. */
export async function ensureBackgroundPlatesForCube(
  images: ProcessedImage[],
  theme: BackgroundPlateTheme = "original",
  options: { onStatus?: (message: string) => void } = {}
): Promise<ProcessedImage[]> {
  if (!images.some((image) => !image.backgroundPlateUrl)) {
    return images;
  }
  return applyBackgroundPlateThemeBatch(images, theme, options);
}

/** Regenerate bg plates only — keeps VoluMax fg matte, depth settings, and cube scene state. */
export async function applyBackgroundPlateThemeBatch(
  images: ProcessedImage[],
  theme: BackgroundPlateTheme,
  options: { onStatus?: (message: string) => void } = {}
): Promise<ProcessedImage[]> {
  const { plateThemeForRender, plateBlurPx } = resolveBackgroundPlateRenderOptions(theme);
  return Promise.all(
    images.map(async (image) => {
      const faceTextureUrl = image.url;
      const originalSourceUrl = resolveOriginalSourceUrl(image, faceTextureUrl);
      const subjectForegroundUrl =
        image.subjectForegroundUrl ?? resolveSubjectForegroundUrl(image) ?? faceTextureUrl;
      options.onStatus?.(`[${image.label}] 배경 플레이트 (${theme}) 적용 중...`);
      const backgroundPlateUrl = await createBackgroundPlateDataUrl(originalSourceUrl, {
        theme: plateThemeForRender,
        blurPx: plateBlurPx,
        center: image.center,
        focus: image.focus,
        subjectBounds: image.subject.bounds,
      });
      const foregroundKind = resolveVoluMaxForegroundKind(image);
      const voluMaxPrepared =
        Boolean(backgroundPlateUrl) &&
        isTransparentMatteDataUrl(subjectForegroundUrl) &&
        foregroundKind === "ai_cutout";
      return {
        ...image,
        backgroundPlateUrl,
        backgroundPlateTheme: theme,
        subjectForegroundUrl,
        voluMaxForegroundKind: foregroundKind,
        voluMaxPrepared: voluMaxPrepared || image.voluMaxPrepared,
        preprocessMode: voluMaxPrepared ? "volumax" : image.preprocessMode,
        byteSize:
          estimateDataUrlBytes(faceTextureUrl) +
          estimateDataUrlBytes(backgroundPlateUrl) +
          estimateDataUrlBytes(subjectForegroundUrl),
      };
    })
  );
}
