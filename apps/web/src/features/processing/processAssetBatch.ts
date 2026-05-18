import type { ImagePreprocessMode, ProcessedImage, ProcessingProgress } from "../../shared/types";
import { arrayBufferToDataUrl } from "../../shared/lib/arrayBufferToDataUrl";
import {
  canAddPresentationImage,
  formatPresentationBytes,
  getPresentationTotalBytes,
  MAX_PRESENTATION_BYTES,
} from "../../shared/lib/mediaLimits";
import { createProgressReporter, type ProgressReporter } from "../../shared/lib/processingProgress";
import { createProcessedImage, resolveAnalysisMetadataBatch } from "./processImage";

export interface DataAssetManifest {
  samples: Array<{
    id: string;
    mimeType: string;
    imagePath: string;
  }>;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8787";
const FETCH_CONCURRENCY = 4;
/** Keep batch POST bodies under API JSON limit (large KakaoTalk originals). */
const ANALYZE_BATCH_SIZE = 4;

interface ProcessAssetBatchOptions {
  onStatus?: (message: string) => void;
  onProgress?: (progress: ProcessingProgress) => void;
  focusTarget?: string;
  preprocessMode?: ImagePreprocessMode;
}

interface LoadedSample {
  index: number;
  sample: DataAssetManifest["samples"][number];
  sourceImage: string;
}

function reportStatus(reporter: ProgressReporter | null, onStatus: ProcessAssetBatchOptions["onStatus"], message: string) {
  onStatus?.(message);
  reporter?.setMessage(message);
}

async function fetchAssetManifest(): Promise<DataAssetManifest> {
  const response = await fetch(`${API_BASE_URL}/asset-manifest/data-asset`);
  if (!response.ok) {
    throw new Error(`Failed to load data/asset manifest (${response.status}).`);
  }
  return (await response.json()) as DataAssetManifest;
}

async function fetchAssetDataUrl(imagePath: string, mimeType: string): Promise<string> {
  const response = await fetch(
    `${API_BASE_URL}/asset-image?path=${encodeURIComponent(imagePath)}`
  );
  if (!response.ok) {
    throw new Error(`Failed to load asset image (${response.status}).`);
  }

  return arrayBufferToDataUrl(await response.arrayBuffer(), mimeType);
}

async function loadSamples(
  samples: DataAssetManifest["samples"],
  reporter: ProgressReporter | null,
  onStatus: ProcessAssetBatchOptions["onStatus"]
): Promise<LoadedSample[]> {
  const loaded: LoadedSample[] = new Array(samples.length);
  let nextIndex = 0;
  let loadedCount = 0;
  const workerCount = Math.min(FETCH_CONCURRENCY, samples.length);

  reporter?.setPhase("loading");

  const worker = async () => {
    while (nextIndex < samples.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      const sample = samples[currentIndex];
      if (!sample) {
        continue;
      }

      const sourceImage = await fetchAssetDataUrl(sample.imagePath, sample.mimeType);
      loaded[currentIndex] = { index: currentIndex, sample, sourceImage };
      loadedCount += 1;
      const message = `data/asset 이미지 불러오는 중 (${loadedCount}/${samples.length})`;
      reporter?.setCurrent(0, message, "loading");
      reportStatus(reporter, onStatus, message);
    }
  };

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return loaded.filter((entry): entry is LoadedSample => Boolean(entry));
}

export async function processDataAssetBatch(
  options: ProcessAssetBatchOptions = {}
): Promise<ProcessedImage[]> {
  const onStatus = options.onStatus;
  const onProgress = options.onProgress;
  const focusTarget = options.focusTarget?.trim();
  const preprocessMode = options.preprocessMode ?? "original";
  const manifest = await fetchAssetManifest();
  const batchLimit =
    typeof sessionStorage !== "undefined"
      ? Number(sessionStorage.getItem("mbox_batch_limit") ?? "0")
      : 0;
  const samples =
    Number.isFinite(batchLimit) && batchLimit > 0
      ? manifest.samples.slice(0, Math.floor(batchLimit))
      : manifest.samples;
  const results: ProcessedImage[] = [];
  const imageTotal = samples.length;
  const reporter = onProgress ? createProgressReporter(imageTotal, onProgress) : null;
  let completedImages = 0;

  reportStatus(
    reporter,
    onStatus,
    `data/asset 이미지 ${imageTotal}장을 불러오는 중입니다...`
  );
  reporter?.setPhase("loading");
  reporter?.setCurrent(0, `data/asset 이미지 ${imageTotal}장을 불러오는 중입니다...`, "loading");

  const loadedSamples = await loadSamples(samples, reporter, onStatus);

  for (let start = 0; start < loadedSamples.length; start += ANALYZE_BATCH_SIZE) {
    const chunk = loadedSamples.slice(start, start + ANALYZE_BATCH_SIZE);
    const analyzeMessage = `data/asset AI 분석 중 (${start + 1}-${start + chunk.length}/${imageTotal})`;
    reporter?.setCurrent(completedImages, analyzeMessage, "analyzing");
    reportStatus(reporter, onStatus, analyzeMessage);

    const metadataById = await resolveAnalysisMetadataBatch(
      chunk.map((entry) => ({ id: entry.sample.id, sourceImage: entry.sourceImage })),
      { onStatus, focusTarget, preprocessMode }
    );

    for (const entry of chunk) {
      const metadata = metadataById.get(entry.sample.id);
      if (!metadata) {
        throw new Error(`Missing analysis metadata for ${entry.sample.id}.`);
      }

      const cropMessage = `data/asset 크롭 중 (${entry.index + 1}/${imageTotal}): ${entry.sample.id}`;
      reporter?.setCurrent(completedImages, cropMessage, "cropping");
      reportStatus(reporter, onStatus, cropMessage);

      const processed = await createProcessedImage(entry.sourceImage, metadata, {
        focusTarget,
        preprocessMode,
        sequenceOrder: entry.index,
      });

      completedImages += 1;
      reporter?.setCurrent(completedImages, cropMessage, "cropping");

      if (!canAddPresentationImage(results, processed.byteSize)) {
        const limitMessage = `1GB 한도에 도달해 ${results.length}장만 처리했습니다. 현재 ${formatPresentationBytes(
          getPresentationTotalBytes(results)
        )} / ${formatPresentationBytes(MAX_PRESENTATION_BYTES)}`;
        reportStatus(reporter, onStatus, limitMessage);
        return results;
      }

      results.push(processed);
    }
  }

  const doneMessage = `data/asset 배치 처리가 완료되었습니다. ${results.length}장`;
  reporter?.complete(doneMessage);
  reportStatus(reporter, onStatus, doneMessage);

  return results;
}
