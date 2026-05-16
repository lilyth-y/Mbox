import { GoogleAuth } from "google-auth-library";
import {
  DEFAULT_VERTEX_LOCATION,
  normalizeCategoryConfidence,
  resolveSuggestedCategory,
  type AnalyzeBatchItem,
  type AnalyzeBatchResultItem,
} from "@mbox/shared";
import {
  createAnalysisCacheKey,
  readAnalysisCache,
  writeAnalysisCache,
} from "./analysisCache.js";
import { DEPTH_GRID_SIZE, synthesizeDepthField } from "./depth.js";
import { ANALYSIS_MODEL, EDIT_MODEL, buildAnalysisPrompt, buildEditPrompt, buildRemoveBackgroundPrompt } from "./prompts.js";
import type {
  AnalysisMetadata,
  DepthField,
  EditResponseBody,
  FocusCentering,
  ImageEditMode,
  ImageFocus,
  SubjectBounds,
  SubjectRecognition,
} from "./types.js";
const VERTEX_SCOPE = "https://www.googleapis.com/auth/cloud-platform";
const auth = new GoogleAuth({ scopes: [VERTEX_SCOPE] });
let cachedAccessToken: { token: string; expiresAt: number } | null = null;

function resolveMaxRetries(): number {
  const parsed = Number(process.env.API_MAX_RETRIES ?? 3);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 3;
}

function resolveRetryBaseMs(): number {
  const parsed = Number(process.env.API_RETRY_BASE_MS ?? 500);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 500;
}

function resolveAnalyzeConcurrency(): number {
  const parsed = Number(process.env.ANALYZE_BATCH_CONCURRENCY ?? 8);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 8;
}

async function getVertexAccessToken(): Promise<string> {
  if (cachedAccessToken && Date.now() < cachedAccessToken.expiresAt) {
    return cachedAccessToken.token;
  }

  const client = await auth.getClient();
  const accessToken = await client.getAccessToken();
  const token = accessToken.token;
  if (!token) {
    throw new Error("Vertex authentication did not return an access token.");
  }

  cachedAccessToken = {
    token,
    expiresAt: Date.now() + 50 * 60 * 1000,
  };
  return token;
}

interface VertexConfig {
  project: string;
  location: string;
}

function getVertexConfig(): VertexConfig {
  const project = process.env.GOOGLE_CLOUD_PROJECT?.trim();
  if (!project) {
    throw new Error("GOOGLE_CLOUD_PROJECT is not configured.");
  }

  return {
    project,
    location: process.env.GOOGLE_CLOUD_LOCATION?.trim() || DEFAULT_VERTEX_LOCATION,
  };
}

function buildVertexUrl(model: string, config: VertexConfig): string {
  return `https://${config.location}-aiplatform.googleapis.com/v1/projects/${config.project}/locations/${config.location}/publishers/google/models/${model}:generateContent`;
}

async function fetchWithRetry<T>(
  url: string,
  options: RequestInit,
  retries = resolveMaxRetries()
): Promise<T> {
  let lastError: unknown;
  const retryBaseMs = resolveRetryBaseMs();

  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      const response = await fetch(url, options);
      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Vertex request failed (${response.status}): ${errorBody}`);
      }
      return (await response.json()) as T;
    } catch (error) {
      lastError = error;
      if (attempt === retries - 1) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 2 ** attempt * retryBaseMs));
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Vertex request failed.");
}

async function vertexGenerateContent<T>(model: string, body: Record<string, unknown>): Promise<T> {
  const config = getVertexConfig();
  const token = await getVertexAccessToken();

  return fetchWithRetry<T>(buildVertexUrl(model, config), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

const FOCUS_CENTERING: FocusCentering[] = [
  "centered",
  "rule_of_thirds",
  "offset",
  "edge_weighted",
];

function normalizeFocus(raw: Partial<ImageFocus> | undefined): ImageFocus {
  const centering = FOCUS_CENTERING.includes(raw?.centering as FocusCentering)
    ? (raw?.centering as FocusCentering)
    : "centered";
  const aestheticScore = Number(raw?.aestheticScore);
  const boundedScore = Number.isFinite(aestheticScore)
    ? Math.min(5, Math.max(1, Math.round(aestheticScore)))
    : 3;

  return {
    onPrimarySubject: raw?.onPrimarySubject ?? true,
    centering,
    aestheticScore: boundedScore,
    compositionNotes: raw?.compositionNotes?.trim() || "Primary subject framing retained for crop.",
  };
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

function normalizeBounds(raw: Partial<SubjectBounds> | undefined, center: { x: number; y: number }): SubjectBounds {
  const x0 = clampPercent(Number(raw?.x0));
  const y0 = clampPercent(Number(raw?.y0));
  const x1 = clampPercent(Number(raw?.x1));
  const y1 = clampPercent(Number(raw?.y1));

  if (Number.isFinite(x0) && Number.isFinite(y0) && Number.isFinite(x1) && Number.isFinite(y1) && x1 > x0 && y1 > y0) {
    return { x0, y0, x1, y1 };
  }

  const half = 18;
  return {
    x0: clampPercent(center.x - half),
    y0: clampPercent(center.y - half),
    x1: clampPercent(center.x + half),
    y1: clampPercent(center.y + half),
  };
}

function normalizeSubject(
  raw: Partial<SubjectRecognition> | undefined,
  focusTarget: string | undefined,
  label: string,
  center: { x: number; y: number }
): SubjectRecognition {
  const requestedTarget = raw?.requestedTarget?.trim() || focusTarget?.trim() || label;
  const confidence = Number(raw?.confidence);
  const boundedConfidence = Number.isFinite(confidence)
    ? Math.min(1, Math.max(0, confidence))
    : raw?.detected === false
      ? 0
      : 0.75;

  return {
    requestedTarget,
    detectedLabel: raw?.detectedLabel?.trim() || label,
    detected: raw?.detected ?? true,
    confidence: boundedConfidence,
    bounds: normalizeBounds(raw?.bounds, center),
  };
}

function normalizeDepthField(
  raw: Partial<DepthField> | undefined,
  center: { x: number; y: number },
  subject: SubjectRecognition
): DepthField {
  const expectedLength = DEPTH_GRID_SIZE * DEPTH_GRID_SIZE;
  const values = Array.isArray(raw?.values)
    ? raw.values
        .slice(0, expectedLength)
        .map((value) => {
          const parsed = Number(value);
          return Number.isFinite(parsed) ? Math.min(1, Math.max(0, parsed)) : 0.5;
        })
    : [];

  if (values.length === expectedLength) {
    const subjectDepth = Number(raw?.subjectDepth);
    return {
      gridSize: DEPTH_GRID_SIZE,
      subjectDepth: Number.isFinite(subjectDepth)
        ? Math.min(1, Math.max(0, subjectDepth))
        : values[Math.floor((center.y / 100) * (DEPTH_GRID_SIZE - 1)) * DEPTH_GRID_SIZE + Math.floor((center.x / 100) * (DEPTH_GRID_SIZE - 1))] ?? 0.75,
      values,
    };
  }

  return synthesizeDepthField(center, subject.bounds);
}

function normalizeAnalysisMetadata(
  raw: Partial<AnalysisMetadata>,
  focusTarget?: string
): AnalysisMetadata {
  if (!raw.label || !raw.center || !raw.bgPrompt) {
    throw new Error("Analysis response did not include required metadata fields.");
  }

  const subject = normalizeSubject(raw.subject, focusTarget, raw.label, raw.center);
  const focus = normalizeFocus(raw.focus);
  const suggestion = resolveSuggestedCategory({
    label: raw.label,
    category: raw.category ?? "",
    categoryConfidence: normalizeCategoryConfidence(raw.categoryConfidence),
    subject,
    focus,
    focusTarget,
  });

  return {
    label: raw.label,
    center: raw.center,
    focus,
    subject,
    depth: normalizeDepthField(raw.depth, raw.center, subject),
    bgPrompt: raw.bgPrompt,
    category: suggestion.category,
    categoryConfidence: suggestion.confidence,
  };
}
interface VertexGenerateResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
        inlineData?: {
          mimeType?: string;
          data?: string;
        };
      }>;
    };
  }>;
}

async function generateAnalysisMetadata(
  imageBase64: string,
  mimeType = "image/png",
  focusTarget?: string
): Promise<AnalysisMetadata> {
  const result = await vertexGenerateContent<VertexGenerateResponse>(ANALYSIS_MODEL, {
    contents: [
      {
        role: "user",
        parts: [
          { text: buildAnalysisPrompt(focusTarget) },
          { inlineData: { mimeType, data: imageBase64 } },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
      maxOutputTokens: 512,
      temperature: 0.2,
    },
  });

  const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error("Analysis response did not include JSON metadata.");
  }

  return normalizeAnalysisMetadata(JSON.parse(text) as Partial<AnalysisMetadata>, focusTarget);
}

export async function analyzeImage(
  imageBase64: string,
  mimeType = "image/png",
  focusTarget?: string
): Promise<AnalysisMetadata> {
  const cacheKey = createAnalysisCacheKey(imageBase64, focusTarget);
  const cached = await readAnalysisCache(cacheKey);
  if (cached) {
    return cached;
  }

  const metadata = await generateAnalysisMetadata(imageBase64, mimeType, focusTarget);
  await writeAnalysisCache(cacheKey, metadata);
  return metadata;
}

export async function analyzeImageBatch(
  items: AnalyzeBatchItem[],
  focusTarget?: string
): Promise<AnalyzeBatchResultItem[]> {
  const results: AnalyzeBatchResultItem[] = new Array(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(resolveAnalyzeConcurrency(), items.length);

  const worker = async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      const item = items[currentIndex];
      if (!item) {
        continue;
      }

      try {
        const metadata = await analyzeImage(item.imageBase64, item.mimeType, focusTarget);
        results[currentIndex] = { id: item.id, metadata };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Analyze request failed.";
        results[currentIndex] = { id: item.id, error: message };
      }
    }
  };

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

export async function editImageBackground(
  imageBase64: string,
  label: string,
  bgPrompt: string,
  mimeType = "image/png",
  editMode: ImageEditMode = "generate_background"
): Promise<EditResponseBody> {
  const prompt =
    editMode === "remove_background"
      ? buildRemoveBackgroundPrompt(label)
      : buildEditPrompt(label, bgPrompt);

  const result = await vertexGenerateContent<VertexGenerateResponse>(EDIT_MODEL, {
    contents: [
      {
        role: "user",
        parts: [
          { text: prompt },
          { inlineData: { mimeType, data: imageBase64 } },
        ],
      },
    ],
    generationConfig: { responseModalities: ["IMAGE"] },
  });

  const inlineData = result.candidates?.[0]?.content?.parts?.find(
    (part) => part.inlineData?.data
  )?.inlineData;

  if (!inlineData?.data) {
    throw new Error("Background edit response did not include image data.");
  }

  return {
    imageBase64: inlineData.data,
    mimeType: inlineData.mimeType ?? "image/png",
  };
}
