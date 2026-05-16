export interface ImageCenter {
  x: number;
  y: number;
}

export type FocusCentering = "centered" | "rule_of_thirds" | "offset" | "edge_weighted";

export interface ImageFocus {
  onPrimarySubject: boolean;
  centering: FocusCentering;
  aestheticScore: number;
  compositionNotes: string;
}

export interface SubjectBounds {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface SubjectRecognition {
  requestedTarget: string;
  detectedLabel: string;
  detected: boolean;
  confidence: number;
  bounds: SubjectBounds;
}

export interface DepthField {
  gridSize: number;
  subjectDepth: number;
  values: number[];
}

export interface AnalysisMetadata {
  label: string;
  center: ImageCenter;
  focus: ImageFocus;
  subject: SubjectRecognition;
  depth: DepthField;
  bgPrompt: string;
  category: string;
  categoryConfidence: number;
}

export interface AnalyzeRequestBody {
  imageBase64: string;
  mimeType?: string;
  focusTarget?: string;
}

export type ImageEditMode = "remove_background" | "generate_background";

export interface EditRequestBody {
  imageBase64: string;
  label: string;
  bgPrompt?: string;
  mimeType?: string;
  editMode?: ImageEditMode;
}

export interface AnalyzeResponseBody {
  metadata: AnalysisMetadata;
}

export interface AnalyzeBatchItem {
  id: string;
  imageBase64: string;
  mimeType?: string;
}

export interface AnalyzeBatchRequestBody {
  items: AnalyzeBatchItem[];
  focusTarget?: string;
}

export interface AnalyzeBatchResultItem {
  id: string;
  metadata?: AnalysisMetadata;
  error?: string;
}

export interface AnalyzeBatchResponseBody {
  results: AnalyzeBatchResultItem[];
}

export interface EditResponseBody {
  imageBase64: string;
  mimeType: string;
}
