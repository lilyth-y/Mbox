import type { ProcessedImage } from "../../shared/types";
import { cropImage } from "../../shared/lib/cropImage";
import { estimateDataUrlBytes } from "../../shared/lib/mediaLimits";
import {
  createBackgroundPlateDataUrl,
  createFaceCompositeDataUrl,
  type BackgroundPlateTheme,
} from "../../shared/lib/backgroundPlate";
import {
  prepareBackgroundRemovalEngine,
  removeBackgroundForImage,
} from "../../shared/lib/removeBackground";

interface ApplyBackgroundRemovalOptions {
  onStatus?: (message: string) => void;
  backgroundPlateTheme?: BackgroundPlateTheme;
}

interface ApplyBackgroundRemovalBatchOptions extends ApplyBackgroundRemovalOptions {
  onProgress?: (current: number, total: number, message: string) => void;
  concurrency?: number;
  backgroundPlateTheme?: BackgroundPlateTheme;
}

/** After WASM preload, 2 parallel removals balance speed and GPU memory. */
const DEFAULT_REMOVAL_CONCURRENCY = 2;

export async function applyBackgroundRemoval(
  image: ProcessedImage,
  options: ApplyBackgroundRemovalOptions = {}
): Promise<ProcessedImage> {
  const onStatus = options.onStatus;
  const sourceUrl = image.preCropSourceUrl ?? image.originalUrl;

  onStatus?.(`[${image.label}] 배경 플레이트 생성 중...`);
  const backgroundPlateUrl = await createBackgroundPlateDataUrl(sourceUrl, {
    theme: options.backgroundPlateTheme,
  });

  try {
    const editResult = await removeBackgroundForImage(image, sourceUrl, onStatus);

    onStatus?.(`[${image.label}] 배경 제거 결과를 1024x1024로 맞추는 중...`);
    const editedUrl = `data:${editResult.mimeType};base64,${editResult.imageBase64}`;
    const cropped = await cropImage(editedUrl, image.center, image.focus);
    const faceCompositeUrl = await createFaceCompositeDataUrl(cropped, backgroundPlateUrl);

    return {
      ...image,
      preCropSourceUrl: editedUrl,
      preparedUrl: cropped,
      url: cropped,
      backgroundPlateUrl,
      faceCompositeUrl,
      preprocessMode: "background_removed",
      byteSize:
        estimateDataUrlBytes(cropped) +
        estimateDataUrlBytes(backgroundPlateUrl) +
        estimateDataUrlBytes(faceCompositeUrl),
    };
  } catch (error) {
    // IMPORTANT: "누끼가 엎어도" 프로세싱 전체가 멈추지 않도록 안전 폴백.
    // 누끼 실패 시에도 배경 플레이트 + (원본 기반) face composite는 만들어
    // 홀로그램/미리보기 파이프라인을 계속 진행할 수 있게 한다.
    const reason = error instanceof Error ? error.message : String(error);
    onStatus?.(`[${image.label}] 배경 제거 실패 — 원본으로 계속 진행합니다. (${reason})`);

    onStatus?.(`[${image.label}] 원본을 1024x1024로 맞추는 중...`);
    const cropped = await cropImage(sourceUrl, image.center, image.focus);
    const faceCompositeUrl = await createFaceCompositeDataUrl(cropped, backgroundPlateUrl);

    return {
      ...image,
      preCropSourceUrl: sourceUrl,
      preparedUrl: cropped,
      url: cropped,
      backgroundPlateUrl,
      faceCompositeUrl,
      preprocessMode: "original",
      byteSize:
        estimateDataUrlBytes(cropped) +
        estimateDataUrlBytes(backgroundPlateUrl) +
        estimateDataUrlBytes(faceCompositeUrl),
    };
  }
}

export async function applyBackgroundRemovalBatch(
  images: ProcessedImage[],
  options: ApplyBackgroundRemovalBatchOptions = {}
): Promise<ProcessedImage[]> {
  const pending = images.filter((image) => image.preprocessMode !== "background_removed");
  if (pending.length === 0) {
    return images;
  }

  const concurrency = Math.max(
    1,
    Math.min(options.concurrency ?? DEFAULT_REMOVAL_CONCURRENCY, pending.length)
  );
  const byId = new Map(images.map((image) => [image.id, image]));
  let completed = 0;

  try {
    await prepareBackgroundRemovalEngine(options.onStatus);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "preload failed";
    options.onStatus?.(`누끼 모델 사전 로드 실패 — 개별 처리 시 재시도합니다. (${reason})`);
  }

  const report = (message: string) => {
    options.onStatus?.(message);
    options.onProgress?.(completed, pending.length, message);
  };

  let nextIndex = 0;

  const worker = async () => {
    while (nextIndex < pending.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      const image = pending[currentIndex];
      if (!image) {
        continue;
      }

      report(`[${completed + 1}/${pending.length}] ${image.label} 배경 제거(누끼) 중...`);
      try {
        const updated = await applyBackgroundRemoval(image, {
          onStatus: options.onStatus,
          backgroundPlateTheme: options.backgroundPlateTheme,
        });
        byId.set(updated.id, updated);
        completed += 1;
        report(
          `[${completed}/${pending.length}] ${image.label} ${
            updated.preprocessMode === "background_removed" ? "배경 제거 완료" : "원본 폴백 완료"
          }`
        );
      } catch (error) {
        // applyBackgroundRemoval 자체도 실패할 수 있는 예외(캔버스/메모리 등)까지 잡고 계속 진행.
        const reason = error instanceof Error ? error.message : String(error);
        completed += 1;
        report(`[${completed}/${pending.length}] ${image.label} 처리 실패 — 건너뜁니다. (${reason})`);
      }
    }
  };

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  return images.map((image) => byId.get(image.id) ?? image);
}
