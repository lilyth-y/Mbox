import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ImageEditMode } from "./types.js";

const servicesDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(servicesDir, "../../../..");
const cacheDir = path.resolve(repoRoot, ".cache/edit");

export interface CachedEditResult {
  mimeType: string;
  imageBase64: string;
}

export function createEditCacheKey(
  imageBase64: string,
  label: string,
  editMode: ImageEditMode,
  bgPrompt = ""
): string {
  return createHash("sha256")
    .update(editMode)
    .update(label.trim())
    .update(bgPrompt.trim())
    .update(imageBase64)
    .digest("hex");
}

export async function readEditCache(cacheKey: string): Promise<CachedEditResult | null> {
  try {
    const raw = await readFile(path.join(cacheDir, `${cacheKey}.json`), "utf-8");
    return JSON.parse(raw) as CachedEditResult;
  } catch {
    return null;
  }
}

export async function writeEditCache(cacheKey: string, result: CachedEditResult): Promise<void> {
  await mkdir(cacheDir, { recursive: true });
  await writeFile(path.join(cacheDir, `${cacheKey}.json`), JSON.stringify(result), "utf-8");
}
