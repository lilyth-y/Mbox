import {
  VAULT_STORAGE_PATHS_KEY,
  type PresignVaultAssetDescriptor,
  type VaultAssetSlot,
  type VaultImageStoragePaths,
} from "@mbox/shared";
import type { ProcessedImage } from "../../shared/types";
import { presignVaultAssets } from "../../shared/api/workspaceClient";

const URL_SLOTS: VaultAssetSlot[] = [
  "url",
  "preparedUrl",
  "originalUrl",
  "preCropSourceUrl",
  "backgroundPlateUrl",
];

function isInlineImageUrl(value: string): boolean {
  return value.startsWith("data:") || value.startsWith("blob:");
}

function readStoragePaths(image: ProcessedImage): VaultImageStoragePaths | undefined {
  const paths = (image as ProcessedImage & Record<string, unknown>)[VAULT_STORAGE_PATHS_KEY];
  if (!paths || typeof paths !== "object") {
    return undefined;
  }
  const candidate = paths as VaultImageStoragePaths;
  return typeof candidate.url === "string" ? candidate : undefined;
}

async function urlToBlob(url: string): Promise<Blob> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to read image bytes (${response.status}).`);
  }
  return response.blob();
}

export async function prepareImagesForServerVault(
  eventId: string,
  images: ProcessedImage[]
): Promise<ProcessedImage[]> {
  const assets: Array<{ imageId: number; slot: VaultAssetSlot; contentType: string }> = [];

  for (const image of images) {
    const existingPaths = readStoragePaths(image);
    for (const slot of URL_SLOTS) {
      const value = image[slot];
      if (!value || !isInlineImageUrl(value)) {
        continue;
      }
      if (existingPaths?.[slot]) {
        continue;
      }
      assets.push({ imageId: image.id, slot, contentType: "image/jpeg" });
    }
  }

  if (assets.length === 0) {
    return images;
  }

  const { uploads } = await presignVaultAssets(eventId, assets);
  const uploadByKey = new Map<string, PresignVaultAssetDescriptor>(
    uploads.map((entry) => [`${entry.imageId}:${entry.slot}`, entry])
  );

  return Promise.all(
    images.map(async (image) => {
      const existingPaths = readStoragePaths(image);
      const storagePaths: VaultImageStoragePaths = { ...(existingPaths ?? { url: "" }) };
      const next: ProcessedImage & Record<string, unknown> = { ...image };

      for (const slot of URL_SLOTS) {
        const value = image[slot];
        if (!value) {
          continue;
        }

        const upload = uploadByKey.get(`${image.id}:${slot}`);
        if (!upload) {
          if (!isInlineImageUrl(value)) {
            storagePaths[slot] = value;
          }
          continue;
        }

        const blob = await urlToBlob(value);
        const putResponse = await fetch(upload.uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": "image/jpeg" },
          body: blob,
        });
        if (!putResponse.ok) {
          throw new Error(`Cloud upload failed for image ${image.id} (${putResponse.status}).`);
        }

        storagePaths[slot] = upload.objectPath;
        next[slot] = upload.readUrl;
      }

      if (!storagePaths.url) {
        storagePaths.url =
          storagePaths.preparedUrl ?? storagePaths.originalUrl ?? storagePaths.preCropSourceUrl ?? "";
      }

      next[VAULT_STORAGE_PATHS_KEY] = storagePaths;
      return next as ProcessedImage;
    })
  );
}
