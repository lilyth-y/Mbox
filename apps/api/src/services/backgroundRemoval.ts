import {
  createEditCacheKey,
  readEditCache,
  writeEditCache,
} from "./editCache.js";
import { editImageWithVertex } from "./gemini.js";
import { removeBackgroundWithMatte } from "./matteBackground.js";
import type { EditResponseBody, ImageEditMode, SubjectBounds } from "./types.js";

export type BackgroundRemovalProvider = "matte" | "vertex";

function resolveRemovalProvider(): BackgroundRemovalProvider {
  const configured = process.env.BACKGROUND_REMOVAL_PROVIDER?.trim().toLowerCase();
  return configured === "vertex" ? "vertex" : "matte";
}

export async function removeBackgroundImage(
  imageBase64: string,
  label: string,
  mimeType: string,
  subjectBounds?: Partial<SubjectBounds>
): Promise<EditResponseBody> {
  const cacheKey = createEditCacheKey(
    imageBase64,
    label,
    "remove_background",
    `provider:${resolveRemovalProvider()}`
  );
  const cached = await readEditCache(cacheKey);
  if (cached) {
    return { imageBase64: cached.imageBase64, mimeType: cached.mimeType };
  }

  const provider = resolveRemovalProvider();
  const response =
    provider === "vertex"
      ? await editImageWithVertex(imageBase64, label, "", mimeType, "remove_background")
      : await removeBackgroundWithMatte(imageBase64, subjectBounds, mimeType);

  await writeEditCache(cacheKey, response);
  return response;
}

export async function editImageBackground(
  imageBase64: string,
  label: string,
  bgPrompt: string,
  mimeType = "image/png",
  editMode: ImageEditMode = "generate_background",
  subjectBounds?: Partial<SubjectBounds>
): Promise<EditResponseBody> {
  if (editMode === "remove_background") {
    return removeBackgroundImage(imageBase64, label, mimeType, subjectBounds);
  }

  return editImageWithVertex(imageBase64, label, bgPrompt, mimeType, editMode);
}
