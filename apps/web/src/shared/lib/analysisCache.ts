import type { AnalysisMetadata } from "../types";

const CACHE_PREFIX = "mbox.analyze:";
const memoryCache = new Map<string, AnalysisMetadata>();

function bytesToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function digestImageBase64(focusTarget: string, imageBase64: string): Promise<string> {
  const focusBytes = new TextEncoder().encode(focusTarget.trim());
  const imageBytes = Uint8Array.from(atob(imageBase64), (char) => char.charCodeAt(0));
  const combined = new Uint8Array(focusBytes.length + imageBytes.length);
  combined.set(focusBytes);
  combined.set(imageBytes, focusBytes.length);
  const digest = await crypto.subtle.digest("SHA-256", combined);
  return bytesToHex(digest);
}

export async function createAnalysisCacheKey(
  imageBase64: string,
  focusTarget?: string
): Promise<string> {
  return digestImageBase64(focusTarget ?? "", imageBase64);
}

export function readAnalysisCache(cacheKey: string): AnalysisMetadata | null {
  const cached = memoryCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    const raw = sessionStorage.getItem(`${CACHE_PREFIX}${cacheKey}`);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as AnalysisMetadata;
  } catch {
    return null;
  }
}

export function writeAnalysisCache(cacheKey: string, metadata: AnalysisMetadata): void {
  memoryCache.set(cacheKey, metadata);
  try {
    sessionStorage.setItem(`${CACHE_PREFIX}${cacheKey}`, JSON.stringify(metadata));
  } catch {
    // Ignore quota or private-mode storage failures.
  }
}
