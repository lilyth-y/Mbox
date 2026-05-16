import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AnalysisMetadata } from "@mbox/shared";

const servicesDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(servicesDir, "../../../..");
const cacheDir = path.resolve(repoRoot, ".cache/analysis");

export function createAnalysisCacheKey(imageBase64: string, focusTarget?: string): string {
  return createHash("sha256")
    .update(focusTarget?.trim() ?? "")
    .update(imageBase64)
    .digest("hex");
}

export async function readAnalysisCache(cacheKey: string): Promise<AnalysisMetadata | null> {
  try {
    const raw = await readFile(path.join(cacheDir, `${cacheKey}.json`), "utf-8");
    return JSON.parse(raw) as AnalysisMetadata;
  } catch {
    return null;
  }
}

export async function writeAnalysisCache(
  cacheKey: string,
  metadata: AnalysisMetadata
): Promise<void> {
  await mkdir(cacheDir, { recursive: true });
  await writeFile(path.join(cacheDir, `${cacheKey}.json`), JSON.stringify(metadata), "utf-8");
}
