import type {
  AnalysisMetadata,
  DepthField,
  FocusCentering,
  ImageCenter,
  ImageFocus,
  ResolutionEnhanceScale,
  SubjectBounds,
  SubjectRecognition,
} from "@mbox/shared";

export type {
  AnalysisMetadata,
  DepthField,
  FocusCentering,
  ImageCenter,
  ImageFocus,
  SubjectBounds,
  SubjectRecognition,
};

export type ImagePreprocessMode = "original" | "background_removed";

export type BackgroundTemplateId =
  | "studio"
  | "nature"
  | "city"
  | "abstract"
  | "warm_interior";

export interface BackgroundGeneration {
  templateId: BackgroundTemplateId;
  prompt: string;
  customPrompt: string;
  applied: boolean;
}

export interface PostProcessingSettings {
  brightness: number;
  contrast: number;
  saturation: number;
  warmth: number;
  shadowLift: number;
  vignette: number;
  sharpness: number;
}

export interface ProcessedImage {
  id: number;
  url: string;
  preparedUrl: string;
  preCropSourceUrl?: string;
  /** Blurred plate from pre-cutout source; used as the slow parallax layer in 3D. */
  backgroundPlateUrl?: string;
  label: string;
  userCategory?: string;
  aiSuggestedCategory: string;
  categoryConfidence: number;
  originalUrl: string;
  center: ImageCenter;
  aiRecommendedCenter?: ImageCenter;
  focus: ImageFocus;
  focusTarget?: string;
  preprocessMode: ImagePreprocessMode;
  subject: SubjectRecognition;
  depth: DepthField;
  backgroundGeneration?: BackgroundGeneration;
  postProcessing?: PostProcessingSettings;
  byteSize: number;
  sequenceOrder?: number;
  /** 2 = 2048-class edge upscale applied in-browser for cube export */
  resolutionEnhanceScale?: ResolutionEnhanceScale;
}

export type AppTab = "upload" | "postprocess" | "cube";

export interface HoloEvent {
  id: string;
  name: string;
  description?: string;
  createdAt: number;
  updatedAt: number;
}

export type ProcessingPhase = "loading" | "analyzing" | "cropping" | "processing" | "complete";

export interface ProcessingProgress {
  phase: ProcessingPhase;
  current: number;
  total: number;
  message: string;
  percent: number;
  etaMs: number | null;
  elapsedMs: number;
}
