import {
  IMGLY_BACKGROUND_REMOVAL_PUBLIC_PATH,
  IMGLY_SEGMENTATION_MODEL_FALLBACKS,
  type ImglySegmentationModel,
} from "@mbox/shared";

export type BackgroundRemovalProgressHandler = (
  message: string,
  key: string,
  current: number,
  total: number
) => void;

type ImglyConfig = {
  publicPath: string;
  model: ImglySegmentationModel;
  device: "cpu" | "gpu";
  proxyToWorker: boolean;
  output: { format: "image/png"; quality: number };
  progress?: (key: string, current: number, total: number) => void;
};

type ImglyModule = typeof import("@imgly/background-removal");

let modulePromise: Promise<ImglyModule> | null = null;
let preloadPromise: Promise<void> | null = null;

async function loadImglyModule(): Promise<ImglyModule> {
  if (!modulePromise) {
    modulePromise = import("@imgly/background-removal");
  }
  return modulePromise;
}

function buildConfig(
  model: ImglySegmentationModel,
  onProgress?: BackgroundRemovalProgressHandler
): ImglyConfig {
  return {
    publicPath: IMGLY_BACKGROUND_REMOVAL_PUBLIC_PATH,
    model,
    device: "gpu",
    proxyToWorker: true,
    output: {
      format: "image/png",
      quality: 0.94,
    },
    progress: onProgress
      ? (key, current, total) => {
          onProgress(`AI 모델 다운로드 (${key})`, key, current, total);
        }
      : undefined,
  };
}

/** Download WASM + ONNX once per session (browser cache thereafter). */
export async function preloadBackgroundRemovalEngine(
  onProgress?: BackgroundRemovalProgressHandler
): Promise<void> {
  if (preloadPromise) {
    return preloadPromise;
  }

  preloadPromise = (async () => {
    const { preload } = await loadImglyModule();
    await preload(buildConfig(IMGLY_SEGMENTATION_MODEL_FALLBACKS[0], onProgress));
  })();

  try {
    await preloadPromise;
  } catch (error) {
    preloadPromise = null;
    throw error;
  }
}

export interface ImglyRemovalResult {
  blob: Blob;
  model: ImglySegmentationModel;
}

/**
 * Tries pinned models in order (fp16 → quint8 → full isnet).
 * Call preloadBackgroundRemovalEngine before batch work when possible.
 */
export async function removeBackgroundWithImgly(
  source: string | Blob,
  onProgress?: BackgroundRemovalProgressHandler
): Promise<ImglyRemovalResult> {
  const { removeBackground } = await loadImglyModule();
  let lastError: unknown;

  // Try GPU first for all models
  for (const model of IMGLY_SEGMENTATION_MODEL_FALLBACKS) {
    try {
      const config = buildConfig(model, onProgress);
      config.device = "gpu";
      const blob = await removeBackground(source, config);
      return { blob, model };
    } catch (error) {
      lastError = error;
      console.warn(`[imgly] GPU background removal failed for model ${model}:`, error);
    }
  }

  // Fallback to CPU for all models
  for (const model of IMGLY_SEGMENTATION_MODEL_FALLBACKS) {
    try {
      const config = buildConfig(model, onProgress);
      config.device = "cpu";
      const blob = await removeBackground(source, config);
      return { blob, model };
    } catch (error) {
      lastError = error;
      console.warn(`[imgly] CPU background removal failed for model ${model}:`, error);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Browser background removal failed for all segmentation models on both GPU and CPU.");
}
