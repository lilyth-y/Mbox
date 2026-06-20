import type { ProcessedImage } from "../../shared/types";
import { WORKSPACE_ID } from "../../shared/config/runtime";
import { MAX_VAULT_BYTES, formatPresentationBytes } from "../../shared/lib/mediaLimits";
import { repairLoadedVaultImages } from "../../shared/lib/voluMaxVaultIntegrity";
import {
  legacyVaultBlobKeyPrefix,
  legacyVaultLocalStorageKey,
  normalizeWorkspaceId,
  vaultBlobKeyPrefix,
  vaultMetaStorageKey,
  workspaceVaultBlobPrefix,
} from "../../shared/lib/workspaceLocalKeys";

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

const LEGACY_VAULT_KEY = (eventId: string) => legacyVaultLocalStorageKey(eventId);

function activeWorkspaceId(workspaceId?: string): string {
  return workspaceId ?? WORKSPACE_ID;
}

type ImageUrlField =
  | "url"
  | "preparedUrl"
  | "originalUrl"
  | "preCropSourceUrl"
  | "backgroundPlateUrl"
  | "subjectForegroundUrl"
  | "faceCompositeUrl";

interface StoredVaultMeta {
  version: 1;
  images: StoredImageMeta[];
}

interface StoredImageMeta {
  id: number;
  label: string;
  subjectForegroundUrl?: string;
  faceCompositeUrl?: string;
  backgroundPlateUrl?: string;
  preCropSourceUrl?: string;
  preparedUrl?: string;
  originalUrl?: string;
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

function blobKey(eventId: string, imageId: number, field: ImageUrlField, workspaceId = WORKSPACE_ID): string {
  return `${vaultBlobKeyPrefix(eventId, workspaceId)}${imageId}:${field}`;
}

function legacyBlobKey(eventId: string, imageId: number, field: ImageUrlField): string {
  return `${legacyVaultBlobKeyPrefix(eventId)}${imageId}:${field}`;
}

function blobLookupKeys(
  eventId: string,
  imageId: number,
  field: ImageUrlField,
  storedKey: string
): string[] {
  const candidates = [storedKey, blobKey(eventId, imageId, field), legacyBlobKey(eventId, imageId, field)];
  return [...new Set(candidates)];
}

const PRIMARY_URL_FIELDS: ImageUrlField[] = [
  "url",
  "preparedUrl",
  "originalUrl",
  "preCropSourceUrl",
];

function tryReadVaultBlobChain(
  store: IDBObjectStore,
  keys: string[],
  onResult: (blob: Blob | undefined) => void,
  onError: (error: DOMException | null) => void
): void {
  let index = 0;
  const next = () => {
    if (index >= keys.length) {
      onResult(undefined);
      return;
    }
    const key = keys[index]!;
    index += 1;
    const request = store.get(key);
    request.onsuccess = () => {
      const value = request.result;
      if (value instanceof Blob) {
        onResult(value);
        return;
      }
      next();
    };
    request.onerror = () => onError(request.error);
  };
  next();
}

function resolvePrimaryVaultUrl(urls: Partial<Record<ImageUrlField, string>>): string | undefined {
  for (const field of PRIMARY_URL_FIELDS) {
    const value = urls[field];
    if (value) {
      return value;
    }
  }
  return undefined;
}

const URL_FIELDS: ImageUrlField[] = [
  "url",
  "preparedUrl",
  "originalUrl",
  "preCropSourceUrl",
  "backgroundPlateUrl",
  "subjectForegroundUrl",
  "faceCompositeUrl",
];

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
    backgroundPlateUrl: _backgroundPlateUrl,
    subjectForegroundUrl: _subjectForegroundUrl,
    faceCompositeUrl: _faceCompositeUrl,
    ...meta
  } = image;

  return { meta: { ...meta, blobKeys }, blobs };
}

async function deserializeImage(
  eventId: string,
  stored: StoredImageMeta
): Promise<ProcessedImage | null> {
  const db = await openDatabase();
  const urls: Partial<Record<ImageUrlField, string>> = {};
  const fields = URL_FIELDS.filter((field) => stored.blobKeys[field]);

  if (fields.length > 0) {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(BLOB_STORE, "readonly");
      const store = transaction.objectStore(BLOB_STORE);
      let pending = fields.length;

      const finish = () => {
        pending -= 1;
        if (pending === 0) {
          resolve();
        }
      };

      const fail = (error: DOMException | null) => {
        reject(error ?? new Error("Failed to read image blob."));
      };

      for (const field of fields) {
        const storedKey = stored.blobKeys[field];
        if (!storedKey) {
          finish();
          continue;
        }

        tryReadVaultBlobChain(
          store,
          blobLookupKeys(eventId, stored.id, field, storedKey),
          (blob) => {
            if (blob) {
              const objectUrl = URL.createObjectURL(blob);
              trackObjectUrl(eventId, objectUrl);
              urls[field] = objectUrl;
            }
            finish();
          },
          fail
        );
      }

      transaction.onerror = () => fail(transaction.error);
    });
  }

  const primaryUrl = resolvePrimaryVaultUrl(urls);
  if (!primaryUrl) {
    return null;
  }

  const { blobKeys: _blobKeys, ...meta } = stored;

  return {
    ...meta,
    url: primaryUrl,
    preparedUrl: urls.preparedUrl ?? primaryUrl,
    originalUrl: urls.originalUrl ?? primaryUrl,
    preCropSourceUrl: urls.preCropSourceUrl ?? meta.preCropSourceUrl,
    backgroundPlateUrl: urls.backgroundPlateUrl ?? meta.backgroundPlateUrl,
    subjectForegroundUrl: urls.subjectForegroundUrl ?? meta.subjectForegroundUrl,
    faceCompositeUrl: urls.faceCompositeUrl ?? meta.faceCompositeUrl,
  };
}

export interface VaultLoadSkippedImage {
  id: number;
  label: string;
}

export interface VaultLoadReport {
  images: ProcessedImage[];
  skipped: VaultLoadSkippedImage[];
}

async function deleteEventBlobs(eventId: string, workspaceId = WORKSPACE_ID): Promise<void> {
  const db = await openDatabase();
  const prefixes = [
    vaultBlobKeyPrefix(eventId, workspaceId),
    legacyVaultBlobKeyPrefix(eventId),
  ];
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(BLOB_STORE, "readwrite");
    const store = transaction.objectStore(BLOB_STORE);
    const request = store.openCursor();

    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        return;
      }
      const key = cursor.key;
      if (typeof key === "string" && prefixes.some((prefix) => key.startsWith(prefix))) {
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

export async function getVaultStorageUsageBytes(
  excludeEventId?: string,
  workspaceId = WORKSPACE_ID
): Promise<number> {
  const db = await openDatabase();
  const workspacePrefix = workspaceVaultBlobPrefix(workspaceId);
  const excludePrefixes = excludeEventId
    ? [vaultBlobKeyPrefix(excludeEventId, workspaceId), legacyVaultBlobKeyPrefix(excludeEventId)]
    : [];
  const includeLegacyBlobs = normalizeWorkspaceId(activeWorkspaceId(workspaceId)) === "default";

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
      if (typeof key === "string" && value instanceof Blob) {
        if (excludePrefixes.some((prefix) => key.startsWith(prefix))) {
          cursor.continue();
          return;
        }
        const inWorkspace =
          key.startsWith(workspacePrefix) ||
          (includeLegacyBlobs && /^[^:]+:\d+:/.test(key) && !key.includes("::"));
        if (inWorkspace) {
          total += value.size;
        }
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

async function readVaultMeta(eventId: string, workspaceId = WORKSPACE_ID): Promise<StoredVaultMeta | undefined> {
  const db = await openDatabase();
  const scopedKey = vaultMetaStorageKey(eventId, workspaceId);
  return new Promise((resolve, reject) => {
    const store = db.transaction(META_STORE, "readonly").objectStore(META_STORE);
    const request = store.get(scopedKey);
    request.onsuccess = () => {
      const scoped = request.result as StoredVaultMeta | undefined;
      if (scoped?.images?.length) {
        resolve(scoped);
        return;
      }
      if (normalizeWorkspaceId(activeWorkspaceId(workspaceId)) !== "default") {
        resolve(undefined);
        return;
      }
      const legacyRequest = store.get(eventId);
      legacyRequest.onsuccess = () => resolve(legacyRequest.result as StoredVaultMeta | undefined);
      legacyRequest.onerror = () => reject(legacyRequest.error);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function loadEventVaultReport(eventId: string): Promise<VaultLoadReport> {
  revokeEventObjectUrls(eventId);

  const meta = await readVaultMeta(eventId);
  if (meta?.images?.length) {
    const loaded = await Promise.all(
      meta.images.map(async (entry) => ({
        entry,
        image: await deserializeImage(eventId, entry),
      }))
    );
    const skipped: VaultLoadSkippedImage[] = [];
    const images: ProcessedImage[] = [];
    for (const { entry, image } of loaded) {
      if (!image) {
        skipped.push({
          id: entry.id,
          label: entry.label?.trim() || `이미지 ${entry.id}`,
        });
        continue;
      }
      images.push(image);
    }
    const repaired = repairLoadedVaultImages(images);
    if (skipped.length > 0 && repaired.length > 0) {
      void saveEventVault(eventId, repaired).catch(() => {
        /* best-effort prune of orphaned vault meta */
      });
    }
    return { images: repaired, skipped };
  }

  const legacy = loadLegacyVault(eventId);
  if (legacy?.length) {
    await saveEventVault(eventId, legacy);
    return { images: legacy, skipped: [] };
  }

  return { images: [], skipped: [] };
}

export async function loadEventVault(eventId: string): Promise<ProcessedImage[]> {
  const report = await loadEventVaultReport(eventId);
  return report.images;
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
      metaStore.put(payload, vaultMetaStorageKey(eventId, WORKSPACE_ID));
      if (normalizeWorkspaceId(WORKSPACE_ID) === "default") {
        metaStore.delete(eventId);
      }

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
    const store = transaction.objectStore(META_STORE);
    store.delete(vaultMetaStorageKey(eventId, WORKSPACE_ID));
    if (normalizeWorkspaceId(WORKSPACE_ID) === "default") {
      store.delete(eventId);
    }
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}
