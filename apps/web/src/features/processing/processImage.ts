import type { AnalysisMetadata, ImagePreprocessMode, ProcessedImage } from "../../shared/types";
import { analyzeImage, analyzeImagesBatch } from "../../shared/api/client";
import {
  createAnalysisCacheKey,
  readAnalysisCache,
  writeAnalysisCache,
} from "../../shared/lib/analysisCache";
import { cropImage } from "../../shared/lib/cropImage";
import { estimateDataUrlBytes } from "../../shared/lib/mediaLimits";
import { resolveFaceCenterAndBounds } from "../../shared/lib/subjectBoundsCrop";
import { prepareImageForApi } from "../../shared/lib/prepareImageForApi";

interface ProcessImageOptions {
  onStatus?: (message: string) => void;
  sequenceOrder?: number;
  focusTarget?: string;
  preprocessMode?: ImagePreprocessMode;
}

export async function createProcessedImage(
  sourceImage: string,
  metadata: AnalysisMetadata,
  options: ProcessImageOptions = {}
): Promise<ProcessedImage> {
  const focusTarget = options.focusTarget?.trim();
  const preprocessMode = options.preprocessMode ?? "original";
  const finalImage = await cropImage(
    sourceImage,
    metadata.center,
    metadata.focus,
    metadata.subject.bounds
  );
  const { center, bounds, depth } = await resolveFaceCenterAndBounds({
    preCropSourceUrl: sourceImage,
    originalUrl: sourceImage,
    center: metadata.center,
    focus: metadata.focus,
    subject: metadata.subject,
  });
  const uniqueId =
    typeof options.sequenceOrder === "number"
      ? options.sequenceOrder * 1_000 + (Date.now() % 1_000)
      : Date.now();

  return {
    id: uniqueId,
    url: finalImage,
    preparedUrl: finalImage,
    preCropSourceUrl: sourceImage,
    label: metadata.label,
    aiSuggestedCategory: metadata.category,
    categoryConfidence: metadata.categoryConfidence,
    originalUrl: sourceImage,
    center,
    aiRecommendedCenter: metadata.center,
    focus: metadata.focus,
    focusTarget,
    preprocessMode,
    subject: { ...metadata.subject, bounds },
    depth,
    byteSize: estimateDataUrlBytes(finalImage),
    sequenceOrder: options.sequenceOrder,
  };
}

const UPLOAD_ANALYZE_CHUNK_SIZE = 8;

export async function processUploadedImages(
  sourceImages: string[],
  options: ProcessImageOptions & {
    onProgress?: (current: number, total: number, message: string) => void;
  } = {}
): Promise<ProcessedImage[]> {
  if (sourceImages.length === 0) {
    return [];
  }
  if (sourceImages.length === 1) {
    const first = sourceImages[0];
    if (!first) {
      return [];
    }
    return [await processUploadedImage(first, options)];
  }

  const focusTarget = options.focusTarget?.trim();
  const preprocessMode = options.preprocessMode ?? "original";
  const total = sourceImages.length;
  const results: ProcessedImage[] = [];
  let sequenceBase = options.sequenceOrder ?? 0;

  for (let start = 0; start < sourceImages.length; start += UPLOAD_ANALYZE_CHUNK_SIZE) {
    const chunkSources = sourceImages.slice(start, start + UPLOAD_ANALYZE_CHUNK_SIZE);
    const chunkStart = start;

    options.onProgress?.(
      chunkStart,
      total,
      `AI 배치 분석 중 (${chunkStart + 1}-${chunkStart + chunkSources.length}/${total})...`
    );
    options.onStatus?.(
      `AI 배치 분석 중 (${chunkStart + 1}-${chunkStart + chunkSources.length}/${total})...`
    );

    const prepared = await Promise.all(
      chunkSources.map(async (sourceImage, offset) => ({
        id: `upload-${chunkStart + offset}`,
        sourceImage,
      }))
    );

    const metadataById = await resolveAnalysisMetadataBatch(prepared, {
      focusTarget,
      preprocessMode,
      onStatus: options.onStatus,
    });

    const cropped = await Promise.all(
      prepared.map(async (entry, offset) => {
        const metadata = metadataById.get(entry.id);
        if (!metadata) {
          throw new Error(`Missing analysis metadata for image ${chunkStart + offset + 1}.`);
        }
        options.onProgress?.(
          chunkStart + offset,
          total,
          `크롭 중 (${chunkStart + offset + 1}/${total})...`
        );
        return createProcessedImage(entry.sourceImage, metadata, {
          focusTarget,
          preprocessMode,
          sequenceOrder: sequenceBase + chunkStart + offset,
        });
      })
    );

    results.push(...cropped);
  }

  return results;
}

export async function processUploadedImage(
  sourceImage: string,
  options: ProcessImageOptions = {}
): Promise<ProcessedImage> {
  const onStatus = options.onStatus;
  const focusTarget = options.focusTarget?.trim();
  const preprocessMode = options.preprocessMode ?? "original";

  onStatus?.(
    focusTarget
      ? `AI가 "${focusTarget}" 피사체와 깊이를 분석 중입니다...`
      : "AI가 이미지 주요 부위를 분석 중입니다..."
  );

  const preparedForApi = await prepareImageForApi(sourceImage);
  const cacheKey = await createAnalysisCacheKey(preparedForApi.base64, focusTarget);
  let metadata = readAnalysisCache(cacheKey);
  if (!metadata) {
    const response = await analyzeImage(preparedForApi.base64, preparedForApi.mimeType, focusTarget);
    metadata = response.metadata;
    writeAnalysisCache(cacheKey, metadata);
  } else {
    onStatus?.("캐시된 분석 결과를 사용합니다.");
  }

  const subjectLabel = metadata.subject.detected
    ? metadata.subject.detectedLabel
    : `${metadata.subject.requestedTarget} (미검출)`;
  onStatus?.(
    `분석 완료: [${subjectLabel}]. 초점 ${metadata.focus.onPrimarySubject ? "주요 피사체" : "보정 필요"} · 1024x1024 크롭 준비 중...`
  );

  onStatus?.("이미지를 1024x1024로 크롭하는 중입니다...");
  return createProcessedImage(sourceImage, metadata, {
    ...options,
    focusTarget,
    preprocessMode,
  });
}

export async function resolveAnalysisMetadata(
  sourceImage: string,
  options: ProcessImageOptions = {}
): Promise<AnalysisMetadata> {
  const focusTarget = options.focusTarget?.trim();
  const preparedForApi = await prepareImageForApi(sourceImage);
  const cacheKey = await createAnalysisCacheKey(preparedForApi.base64, focusTarget);
  const cached = readAnalysisCache(cacheKey);
  if (cached) {
    options.onStatus?.("캐시된 분석 결과를 사용합니다.");
    return cached;
  }

  const response = await analyzeImage(preparedForApi.base64, preparedForApi.mimeType, focusTarget);
  writeAnalysisCache(cacheKey, response.metadata);
  return response.metadata;
}

export async function resolveAnalysisMetadataBatch(
  sources: Array<{ id: string; sourceImage: string }>,
  options: ProcessImageOptions = {}
): Promise<Map<string, AnalysisMetadata>> {
  const focusTarget = options.focusTarget?.trim();
  const resolved = new Map<string, AnalysisMetadata>();
  const pending: Array<{ id: string; imageBase64: string; mimeType: string }> = [];

  const preparedEntries = await Promise.all(
    sources.map(async (source) => {
      const preparedForApi = await prepareImageForApi(source.sourceImage);
      const cacheKey = await createAnalysisCacheKey(preparedForApi.base64, focusTarget);
      const cached = readAnalysisCache(cacheKey);
      return { source, preparedForApi, cacheKey, cached };
    })
  );

  for (const entry of preparedEntries) {
    if (entry.cached) {
      resolved.set(entry.source.id, entry.cached);
      continue;
    }

    pending.push({
      id: entry.source.id,
      imageBase64: entry.preparedForApi.base64,
      mimeType: entry.preparedForApi.mimeType,
    });
  }

  if (pending.length === 0) {
    return resolved;
  }

  let remaining = pending;
  for (let attempt = 0; attempt < 3 && remaining.length > 0; attempt += 1) {
    options.onStatus?.(
      attempt === 0
        ? `AI 배치 분석 중 (${remaining.length}장, 캐시 ${resolved.size}장)...`
        : `AI 배치 재시도 중 (${remaining.length}장, ${attempt + 1}/3)...`
    );
    const response = await analyzeImagesBatch(remaining, focusTarget);
    const failed: typeof remaining = [];

    for (const item of response.results) {
      if (!item.metadata) {
        const source = remaining.find((candidate) => candidate.id === item.id);
        if (source) {
          failed.push(source);
        }
        continue;
      }

      resolved.set(item.id, item.metadata);
      const pendingItem = remaining.find((candidate) => candidate.id === item.id);
      if (pendingItem) {
        const cacheKey = await createAnalysisCacheKey(pendingItem.imageBase64, focusTarget);
        writeAnalysisCache(cacheKey, item.metadata);
      }
    }

    remaining = failed;
    if (remaining.length > 0 && attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, 800 * (attempt + 1)));
    }
  }

  if (remaining.length > 0) {
    const first = remaining[0];
    throw new Error(`Failed to analyze ${first?.id ?? "image"} after retries.`);
  }

  return resolved;
}
