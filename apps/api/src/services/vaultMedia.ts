import type { VaultAssetSlot, VaultImageRecord, VaultImageStoragePaths } from "@mbox/shared";
import { VAULT_STORAGE_PATHS_KEY } from "@mbox/shared";
import {
  buildVaultObjectPath,
  createVaultReadUrl,
  isGcsVaultEnabled,
  uploadVaultObject,
} from "./gcsVaultStorage.js";

const URL_SLOTS: VaultAssetSlot[] = [
  "url",
  "preparedUrl",
  "originalUrl",
  "preCropSourceUrl",
  "backgroundPlateUrl",
];

function isInlineImageUrl(value: unknown): value is string {
  return typeof value === "string" && (value.startsWith("data:") || value.startsWith("blob:"));
}

function parseDataUrl(dataUrl: string): { buffer: Buffer; contentType: string } {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(dataUrl);
  if (!match) {
    throw new Error("Invalid data URL.");
  }
  const contentType = match[1] || "image/jpeg";
  const isBase64 = Boolean(match[2]);
  const payload = match[3] ?? "";
  const buffer = isBase64
    ? Buffer.from(payload, "base64")
    : Buffer.from(decodeURIComponent(payload), "utf8");
  return { buffer, contentType };
}

async function inlineUrlToBuffer(url: string): Promise<{ buffer: Buffer; contentType: string }> {
  if (url.startsWith("data:")) {
    return parseDataUrl(url);
  }
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to read image payload (${response.status}).`);
  }
  const contentType = response.headers.get("content-type") ?? "image/jpeg";
  const arrayBuffer = await response.arrayBuffer();
  return { buffer: Buffer.from(arrayBuffer), contentType };
}

function readStoragePaths(record: VaultImageRecord): VaultImageStoragePaths | null {
  const paths = record[VAULT_STORAGE_PATHS_KEY];
  if (!paths || typeof paths !== "object") {
    return null;
  }
  const candidate = paths as VaultImageStoragePaths;
  return typeof candidate.url === "string" ? candidate : null;
}

export async function dehydrateVaultImage(
  workspaceId: string,
  eventId: string,
  record: VaultImageRecord
): Promise<VaultImageRecord> {
  if (!isGcsVaultEnabled()) {
    return record;
  }

  const imageId = Number(record.id);
  if (!Number.isFinite(imageId)) {
    throw new Error("Vault image id is required for cloud storage.");
  }

  const existingPaths = readStoragePaths(record);
  const storagePaths: VaultImageStoragePaths = existingPaths
    ? { ...existingPaths }
    : { url: buildVaultObjectPath(workspaceId, eventId, imageId, "url") };

  const slim: VaultImageRecord = { ...record };
  const seen = new Map<string, string>();

  for (const slot of URL_SLOTS) {
    const value = record[slot];
    if (!value) {
      delete slim[slot];
      continue;
    }

    if (!isInlineImageUrl(value)) {
      if (typeof value === "string" && !existingPaths) {
        storagePaths[slot] = value;
      }
      continue;
    }

    const reused = seen.get(value);
    if (reused) {
      storagePaths[slot] = reused;
      delete slim[slot];
      continue;
    }

    const objectPath =
      existingPaths?.[slot] ?? buildVaultObjectPath(workspaceId, eventId, imageId, slot);
    const { buffer, contentType } = await inlineUrlToBuffer(value);
    await uploadVaultObject(objectPath, buffer, contentType);
    seen.set(value, objectPath);
    storagePaths[slot] = objectPath;
    delete slim[slot];
  }

  if (!storagePaths.url) {
    storagePaths.url =
      storagePaths.preparedUrl ??
      storagePaths.originalUrl ??
      buildVaultObjectPath(workspaceId, eventId, imageId, "url");
  }

  slim[VAULT_STORAGE_PATHS_KEY] = storagePaths;
  return slim;
}

export async function hydrateVaultImage(record: VaultImageRecord): Promise<VaultImageRecord> {
  if (!isGcsVaultEnabled()) {
    return record;
  }

  const storagePaths = readStoragePaths(record);
  if (!storagePaths) {
    return record;
  }

  const hydrated: VaultImageRecord = { ...record };
  for (const slot of URL_SLOTS) {
    const objectPath = storagePaths[slot];
    if (!objectPath) {
      continue;
    }
    if (objectPath.startsWith("http://") || objectPath.startsWith("https://")) {
      hydrated[slot] = objectPath;
      continue;
    }
    hydrated[slot] = await createVaultReadUrl(objectPath);
  }

  if (!hydrated.url && typeof hydrated.preparedUrl === "string") {
    hydrated.url = hydrated.preparedUrl;
  }
  if (!hydrated.preparedUrl && typeof hydrated.url === "string") {
    hydrated.preparedUrl = hydrated.url;
  }
  if (!hydrated.originalUrl && typeof hydrated.url === "string") {
    hydrated.originalUrl = hydrated.url;
  }

  return hydrated;
}

export async function dehydrateVaultImages(
  workspaceId: string,
  eventId: string,
  images: VaultImageRecord[]
): Promise<VaultImageRecord[]> {
  if (!isGcsVaultEnabled()) {
    return images;
  }
  return Promise.all(images.map((image) => dehydrateVaultImage(workspaceId, eventId, image)));
}

export async function hydrateVaultImages(images: VaultImageRecord[]): Promise<VaultImageRecord[]> {
  if (!isGcsVaultEnabled()) {
    return images;
  }
  return Promise.all(images.map((image) => hydrateVaultImage(image)));
}
