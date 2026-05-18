import { buildApiHeaders } from "./headers";
import { formatApiConnectionError } from "./connectionErrors";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8787";

function resolveMaxRetries(): number {
  const parsed = Number(import.meta.env.VITE_API_MAX_RETRIES ?? 3);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 3;
}

function resolveRetryBaseMs(): number {
  const parsed = Number(import.meta.env.VITE_API_RETRY_BASE_MS ?? 500);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 500;
}

async function fetchWithRetry<T>(
  path: string,
  options: RequestInit,
  retries = resolveMaxRetries()
): Promise<T> {
  let lastError: unknown;
  const retryBaseMs = resolveRetryBaseMs();

  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      const response = await fetch(`${API_BASE_URL}${path}`, {
        ...options,
        headers: buildApiHeaders(options.headers),
      });
      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`API request failed (${response.status}): ${errorBody}`);
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

  if (lastError instanceof TypeError) {
    throw new Error(formatApiConnectionError(API_BASE_URL));
  }

  throw lastError instanceof Error ? lastError : new Error("API request failed.");
}

export async function analyzeImage(
  imageBase64: string,
  mimeType = "image/png",
  focusTarget?: string
) {
  return fetchWithRetry<{ metadata: import("../types").AnalysisMetadata }>("/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageBase64, mimeType, focusTarget }),
  });
}

export async function analyzeImagesBatch(
  items: import("@mbox/shared").AnalyzeBatchItem[],
  focusTarget?: string
) {
  return fetchWithRetry<import("@mbox/shared").AnalyzeBatchResponseBody>("/analyze/batch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items, focusTarget }),
  });
}

export async function editImageBackground(
  imageBase64: string,
  label: string,
  bgPrompt: string,
  mimeType = "image/png",
  editMode: "remove_background" | "generate_background" = "generate_background",
  subjectBounds?: { x0: number; y0: number; x1: number; y1: number }
) {
  return fetchWithRetry<{ imageBase64: string; mimeType: string }>("/edit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageBase64, label, bgPrompt, mimeType, editMode, subjectBounds }),
  });
}

export async function checkApiHealth() {
  return fetchWithRetry<{ ok: boolean; service: string }>("/health", {
    method: "GET",
  });
}
