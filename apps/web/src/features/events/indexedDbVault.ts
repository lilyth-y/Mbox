import type { ProcessedImage } from "../../shared/types";
import { MAX_VAULT_BYTES, formatPresentationBytes } from "../../shared/lib/mediaLimits";

export type VaultSaveFailureReason = "quota" | "storage";

export interface VaultSaveResult {
  saved: boolean;
  reason?: VaultSaveFailureReason;
  usageBytes?: number;
}

const DB_NAME = "mbox-vault";
const DB_VERSION = 1;
const META_STORE = "vault_meta";
const BLOB_STORE = "vault_blobs";

const LEGACY_VAULT_KEY = (eventId: string) => `mbox.events.vault.${eventId}`;

type ImageUrlField = "url" | "preparedUrl" | "originalUrl" | "preCropSourceUrl";

interface StoredVaultMeta {
  version: 1;
  images: StoredImageMeta[];
}

interface StoredImageMeta {
  id: number;
  label: string;
  userCategory?: string;
  aiSuggestedCategory: string;
  categoryConfidence: number;
  center: ProcessedImage["center"];
  aiRecommendedCenter?: ProcessedImage["center"];
  focus: ProcessedImage["focus"];
  focusTarget?: string;
  preprocessMode: ProcessedImage["preprocessMode"];
  subject: ProcessedImage["subject"];
  depth: ProcessedImage["depth"];
  backgroundGeneration?: ProcessedImage["backgroundGeneration"];
  postProcessing?: ProcessedImage["postProcessing"];
  byteSize: number;
  sequenceOrder?: number;
  blobKeys: Partial<Record<ImageUrlField, string>>;
}

const objectUrlsByEvent = new Map<string, Set<string>>();

function trackObjectUrl(eventId: string, objectUrl: string): void {
  if (!objectUrl.startsWith("blob:")) {
    return;
  }
  const bucket = objectUrlsByEvent.get(eventId) ?? new Set<string>();
  bucket.add(objectUrl);
  objectUrlsByEvent.set(eventId, bucket);
}

export function revokeEventObjectUrls(eventId: string): void {
  const bucket = objectUrlsByEvent.get(eventId);
  if (!bucket) {
    return;
  }
  bucket.forEach((url) => URL.revokeObjectURL(url));
  objectUrlsByEvent.delete(eventId);
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed."));
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE);
      }
      if (!db.objectStoreNames.contains(BLOB_STORE)) {
        db.createObjectStore(BLOB_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl);
  return response.blob();
}

function blobKey(eventId: string, imageId: number, field: ImageUrlField): string {
  return `${eventId}:${imageId}:${field}`;
}

const URL_FIELDS: ImageUrlField[] = ["url", "preparedUrl", "originalUrl", "preCropSourceUrl"];

async function planImageStorage(
  eventId: string,
  image: ProcessedImage
): Promise<{ meta: StoredImageMeta; blobs: Array<{ key: string; blob: Blob }> }> {
  const blobKeys: Partial<Record<ImageUrlField, string>> = {};
  const contentToKey = new Map<string, string>();
  const blobs: Array<{ key: string; blob: Blob }> = [];

  for (const field of URL_FIELDS) {
    const value = image[field];
    if (!value) {
      continue;
    }

    const reused = contentToKey.get(value);
    if (reused) {
      blobKeys[field] = reused;
      continue;
    }

    const key = blobKey(eventId, image.id, field);
    const blob = await dataUrlToBlob(value);
    contentToKey.set(value, key);
    blobKeys[field] = key;
    blobs.push({ key, blob });
  }

  const {
    url: _url,
    preparedUrl: _preparedUrl,
    originalUrl: _originalUrl,
    preCropSourceUrl: _preCropSourceUrl,
    ...meta
  } = image;

  return { meta: { ...meta, blobKeys }, blobs };
}

async function deserializeImage(eventId: string, stored: StoredImageMeta): Promise<ProcessedImage> {
  const db = await openDatabase();
  const urls: Partial<Record<ImageUrlField, string>> = {};

  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(BLOB_STORE, "readonly");
    const store = transaction.objectStore(BLOB_STORE);
    const fields = URL_FIELDS.filter((field) => stored.blobKeys[field]);

    if (fields.length === 0) {
      resolve();
      return;
    }

    let pending = fields.length;
    const fail = (error: DOMException | null) => {
      reject(error ?? new Error("Failed to read image blob."));
    };

    for (const field of fields) {
      const key = stored.blobKeys[field];
      if (!key) {
        pending -= 1;
        if (pending === 0) {
          resolve();
        }
        continue;
      }

      const request = store.get(key);
      request.onsuccess = () => {
        const blob = request.result;
        if (blob instanceof Blob) {
          const objectUrl = URL.createObjectURL(blob);
          trackObjectUrl(eventId, objectUrl);
          urls[field] = objectUrl;
        }
        pending -= 1;
        if (pending === 0) {
          resolve();
        }
      };
      request.onerror = () => fail(request.error);
    }

    transaction.onerror = () => fail(transaction.error);
  });

  if (!urls.url) {
    throw new Error(`Vault image ${stored.id} is missing primary url blob.`);
  }

  return {
    ...stored,
    url: urls.url,
    preparedUrl: urls.preparedUrl ?? urls.url,
    originalUrl: urls.originalUrl ?? urls.url,
    preCropSourceUrl: urls.preCropSourceUrl,
  };
}

async function deleteEventBlobs(eventId: string): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(BLOB_STORE, "readwrite");
    const store = transaction.objectStore(BLOB_STORE);
    const prefix = `${eventId}:`;
    const request = store.openCursor();

    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        return;
      }
      if (typeof cursor.key === "string" && cursor.key.startsWith(prefix)) {
        cursor.delete();
      }
      cursor.continue();
    };
    request.onerror = () => reject(request.error ?? new Error("Failed to clear vault blobs."));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Blob cleanup failed."));
  });
}

function loadLegacyVault(eventId: string): ProcessedImage[] | null {
  try {
    const raw = localStorage.getItem(LEGACY_VAULT_KEY(eventId));
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as ProcessedImage[]) : null;
  } catch {
    return null;
  }
}

export async function getVaultStorageUsageBytes(excludeEventId?: string): Promise<number> {
  const db = await openDatabase();
  const prefix = excludeEventId ? `${excludeEventId}:` : null;

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(BLOB_STORE, "readonly");
    const store = transaction.objectStore(BLOB_STORE);
    const request = store.openCursor();
    let total = 0;

    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        return;
      }
      const key = cursor.key;
      const value = cursor.value;
      if (
        typeof key === "string" &&
        (!prefix || !key.startsWith(prefix)) &&
        value instanceof Blob
      ) {
        total += value.size;
      }
      cursor.continue();
    };
    request.onerror = () => reject(request.error ?? new Error("Failed to measure vault usage."));
    transaction.oncomplete = () => resolve(total);
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function getVaultQuotaSnapshot(excludeEventId?: string): Promise<{
  usageBytes: number;
  limitBytes: number;
}> {
  const usageBytes = await getVaultStorageUsageBytes(excludeEventId);
  return { usageBytes, limitBytes: MAX_VAULT_BYTES };
}

async function readVaultMeta(eventId: string): Promise<StoredVaultMeta | undefined> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction(META_STORE, "readonly").objectStore(META_STORE).get(eventId);
    request.onsuccess = () => resolve(request.result as StoredVaultMeta | undefined);
    request.onerror = () => reject(request.error);
  });
}

export async function loadEventVault(eventId: string): Promise<ProcessedImage[]> {
  revokeEventObjectUrls(eventId);

  const meta = await readVaultMeta(eventId);
  if (meta?.images?.length) {
    return Promise.all(meta.images.map((entry) => deserializeImage(eventId, entry)));
  }

  const legacy = loadLegacyVault(eventId);
  if (legacy?.length) {
    await saveEventVault(eventId, legacy);
    return legacy;
  }

  return [];
}

export async function saveEventVault(
  eventId: string,
  images: ProcessedImage[]
): Promise<VaultSaveResult> {
  try {
    const plans = await Promise.all(images.map((image) => planImageStorage(eventId, image)));
    const payload: StoredVaultMeta = {
      version: 1,
      images: plans.map((plan) => plan.meta),
    };
    const blobWrites = plans.flatMap((plan) => plan.blobs);
    const plannedEventBytes = blobWrites.reduce((total, entry) => total + entry.blob.size, 0);
    const otherEventsBytes = await getVaultStorageUsageBytes(eventId);
    const nextUsageBytes = otherEventsBytes + plannedEventBytes;

    if (nextUsageBytes > MAX_VAULT_BYTES) {
      return {
        saved: false,
        reason: "quota",
        usageBytes: nextUsageBytes,
      };
    }

    // Keep in-memory blob: URLs valid for the current tab; revoke only on load/delete.
    await deleteEventBlobs(eventId);

    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction([META_STORE, BLOB_STORE], "readwrite");
      const blobStore = transaction.objectStore(BLOB_STORE);
      const metaStore = transaction.objectStore(META_STORE);

      for (const { key, blob } of blobWrites) {
        blobStore.put(blob, key);
      }
      metaStore.put(payload, eventId);

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Vault save failed."));
    });

    localStorage.removeItem(LEGACY_VAULT_KEY(eventId));
    return { saved: true, usageBytes: nextUsageBytes };
  } catch {
    return { saved: false, reason: "storage" };
  }
}

export function formatVaultQuotaMessage(usageBytes: number): string {
  return `${formatPresentationBytes(usageBytes)} / ${formatPresentationBytes(MAX_VAULT_BYTES)}`;
}

export async function deleteEventVault(eventId: string): Promise<void> {
  revokeEventObjectUrls(eventId);
  localStorage.removeItem(LEGACY_VAULT_KEY(eventId));
  await deleteEventBlobs(eventId);

  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(META_STORE, "readwrite");
    transaction.objectStore(META_STORE).delete(eventId);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}
