import type { AnalysisMetadata } from "./types.js";

interface VertexGenerateResponse {
  candidates?: Array<{
    finishReason?: string;
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
  promptFeedback?: {
    blockReason?: string;
  };
}

export function extractVertexResponseText(result: VertexGenerateResponse): string {
  const blockReason = result.promptFeedback?.blockReason;
  if (blockReason) {
    throw new Error(`Vertex blocked the analysis request (${blockReason}).`);
  }

  const parts = result.candidates?.[0]?.content?.parts ?? [];
  const text = parts.map((part) => part.text?.trim()).filter(Boolean).join("\n").trim();
  if (text) {
    return text;
  }

  const finishReason = result.candidates?.[0]?.finishReason;
  throw new Error(
    finishReason
      ? `Vertex returned no analysis JSON (finishReason=${finishReason}).`
      : "Analysis response did not include JSON metadata."
  );
}

export function parseAnalysisJson(text: string): Partial<AnalysisMetadata> {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = (fenced?.[1] ?? trimmed).trim();

  try {
    return JSON.parse(candidate) as Partial<AnalysisMetadata>;
  } catch {
    const repaired = repairTruncatedJson(candidate);
    return JSON.parse(repaired) as Partial<AnalysisMetadata>;
  }
}

function repairTruncatedJson(text: string): string {
  let repaired = text.replace(/,\s*([}\]])/g, "$1");
  const openBraces = (repaired.match(/{/g) ?? []).length;
  const closeBraces = (repaired.match(/}/g) ?? []).length;
  if (closeBraces < openBraces) {
    repaired = `${repaired}${"}".repeat(openBraces - closeBraces)}`;
  }
  return repaired;
}

export function coerceAnalysisMetadata(
  raw: Partial<AnalysisMetadata>,
  focusTarget?: string
): Partial<AnalysisMetadata> {
  const label = raw.label?.trim() || focusTarget?.trim() || "subject";
  const centerX = Number(raw.center?.x);
  const centerY = Number(raw.center?.y);
  const center = {
    x: Number.isFinite(centerX) ? Math.min(100, Math.max(0, centerX)) : 50,
    y: Number.isFinite(centerY) ? Math.min(100, Math.max(0, centerY)) : 50,
  };

  return {
    ...raw,
    label,
    center,
    bgPrompt: raw.bgPrompt?.trim() || "natural soft background",
    focus: raw.focus ?? {
      onPrimarySubject: true,
      centering: "centered",
      aestheticScore: 3,
      compositionNotes: "Auto-filled focus metadata.",
    },
    subject: raw.subject ?? {
      requestedTarget: focusTarget?.trim() || label,
      detectedLabel: label,
      detected: true,
      confidence: 0.7,
      bounds: { x0: 20, y0: 20, x1: 80, y1: 80 },
    },
    depth: raw.depth,
    category: raw.category,
    categoryConfidence: raw.categoryConfidence,
  };
}
