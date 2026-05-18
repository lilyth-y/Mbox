/**
 * Pinned @imgly/background-removal stack — bump together with apps/web/package.json.
 * @see https://www.npmjs.com/package/@imgly/background-removal
 */
export const IMGLY_BACKGROUND_REMOVAL_VERSION = "1.7.0";

/** Must match onnxruntime-web in apps/web/package.json (peer of imgly). */
export const IMGLY_ONNXRUNTIME_WEB_VERSION = "1.21.0";

/** Versioned CDN — WASM/onnx assets stay aligned with the npm package major.minor.patch. */
export const IMGLY_BACKGROUND_REMOVAL_PUBLIC_PATH =
  `https://staticimgly.com/@imgly/background-removal-data/${IMGLY_BACKGROUND_REMOVAL_VERSION}/dist/`;

export type ImglySegmentationModel = "isnet" | "isnet_fp16" | "isnet_quint8";

/** Quality-first order; quint8/isnet used only when fp16 fails. */
export const IMGLY_SEGMENTATION_MODEL_FALLBACKS: readonly ImglySegmentationModel[] = [
  "isnet_fp16",
  "isnet_quint8",
  "isnet",
] as const;
