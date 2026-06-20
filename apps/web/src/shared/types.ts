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
import type { BackgroundPlateTheme } from "./lib/backgroundPlate";

export type {
  AnalysisMetadata,
  DepthField,
  FocusCentering,
  ImageCenter,
  ImageFocus,
  SubjectBounds,
  SubjectRecognition,
};

export type ImagePreprocessMode = "original" | "background_removed" | "volumax";

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
  /** Full-scene plate for VoluMax bg layer (prefer theme `original`). */
  backgroundPlateUrl?: string;
  /** Theme used when `backgroundPlateUrl` was generated. */
  backgroundPlateTheme?: BackgroundPlateTheme;
  /** Soft-matted or AI-cut subject PNG for VoluMax fg layer. */
  subjectForegroundUrl?: string;
  /** Full-frame AI matte before face crop — refocus re-crops fg with `url`. */
  subjectMatteSourceUrl?: string;
  /** How `subjectForegroundUrl` was produced — AI cutout required for silhouette parallax. */
  voluMaxForegroundKind?: "ai_cutout" | "soft_matte" | "none";
  /** True when plate + PNG matte were generated for VoluMax dual-layer. */
  voluMaxPrepared?: boolean;
  /** BG plate + cutout FG baked for cube face surface (fan mode). */
  faceCompositeUrl?: string;
  /** MP4 / showcase bottom line (manual input). */
  caption?: string;
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
