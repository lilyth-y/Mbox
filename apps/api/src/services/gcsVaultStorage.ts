import type { Response } from "express";
import { Storage } from "@google-cloud/storage";
import {
  buildVaultMediaReadUrl,
  buildVaultMediaUploadUrl,
  resolveApiPublicBaseUrl,
} from "./vaultMediaAccess.js";

const storage = new Storage();

function resolveBucketName(): string | null {
  const bucket = process.env.GCS_VAULT_BUCKET?.trim();
  return bucket || null;
}

export function isGcsVaultEnabled(): boolean {
  return Boolean(resolveBucketName());
}

function safeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 96);
}

export function buildVaultObjectPath(
  workspaceId: string,
  eventId: string,
  imageId: number,
  slot: string
): string {
  return `workspaces/${safeSegment(workspaceId)}/events/${safeSegment(eventId)}/images/${imageId}/${slot}.jpg`;
}

function getBucket() {
  const bucketName = resolveBucketName();
  if (!bucketName) {
    throw new Error("GCS_VAULT_BUCKET is not configured.");
  }
  return storage.bucket(bucketName);
}

export async function uploadVaultObject(
  objectPath: string,
  data: Buffer,
  contentType = "image/jpeg"
): Promise<void> {
  const file = getBucket().file(objectPath);
  await file.save(data, {
    resumable: false,
    metadata: { contentType, cacheControl: "private, max-age=3600" },
  });
}

export async function createVaultUploadUrl(
  objectPath: string,
  contentType = "image/jpeg"
): Promise<{ uploadUrl: string; readUrl: string }> {
  if (resolveApiPublicBaseUrl()) {
    return {
      uploadUrl: buildVaultMediaUploadUrl(objectPath, contentType),
      readUrl: buildVaultMediaReadUrl(objectPath),
    };
  }

  const file = getBucket().file(objectPath);
  const [uploadUrl] = await file.getSignedUrl({
    version: "v4",
    action: "write",
    expires: Date.now() + 15 * 60 * 1000,
    contentType,
  });
  const [readUrl] = await file.getSignedUrl({
    version: "v4",
    action: "read",
    expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
  });
  return { uploadUrl, readUrl };
}

export async function createVaultReadUrl(objectPath: string): Promise<string> {
  if (resolveApiPublicBaseUrl()) {
    return buildVaultMediaReadUrl(objectPath);
  }

  const file = getBucket().file(objectPath);
  const [readUrl] = await file.getSignedUrl({
    version: "v4",
    action: "read",
    expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
  });
  return readUrl;
}

export async function streamVaultObject(objectPath: string, res: Response): Promise<void> {
  const file = getBucket().file(objectPath);
  const [exists] = await file.exists();
  if (!exists) {
    res.status(404).json({ error: "Vault object not found." });
    return;
  }

  const [metadata] = await file.getMetadata();
  res.setHeader("Content-Type", metadata.contentType || "image/jpeg");
  res.setHeader("Cache-Control", "private, max-age=3600");

  await new Promise<void>((resolve, reject) => {
    file
      .createReadStream()
      .on("error", reject)
      .on("end", () => resolve())
      .pipe(res);
  });
}

export async function deleteVaultEventPrefix(workspaceId: string, eventId: string): Promise<void> {
  if (!isGcsVaultEnabled()) {
    return;
  }
  const prefix = `workspaces/${safeSegment(workspaceId)}/events/${safeSegment(eventId)}/`;
  await getBucket().deleteFiles({ prefix, force: true });
}
