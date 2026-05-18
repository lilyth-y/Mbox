import type { CategoryAssignmentMap, HoloEvent, WorkspaceMeta } from "./holo-event.js";

/** Opaque processed gallery entries (full shape owned by apps/web). */
export type VaultImageRecord = Record<string, unknown>;

export interface WorkspaceBootstrapResponse extends WorkspaceMeta {
  vault: VaultImageRecord[];
  categoryAssignments: CategoryAssignmentMap;
}

export interface PutVaultRequest {
  images: VaultImageRecord[];
}

export type VaultAssetSlot =
  | "url"
  | "preparedUrl"
  | "originalUrl"
  | "preCropSourceUrl"
  | "backgroundPlateUrl";

export interface VaultImageStoragePaths {
  url: string;
  preparedUrl?: string;
  originalUrl?: string;
  preCropSourceUrl?: string;
  backgroundPlateUrl?: string;
}

/** Set on vault records when blobs live in GCS (cross-device sync). */
export const VAULT_STORAGE_PATHS_KEY = "storagePaths";

export interface PresignVaultAssetRequest {
  assets: Array<{
    imageId: number;
    slot: VaultAssetSlot;
    contentType?: string;
  }>;
}

export interface PresignVaultAssetDescriptor {
  imageId: number;
  slot: VaultAssetSlot;
  objectPath: string;
  uploadUrl: string;
  readUrl: string;
}

export interface PresignVaultAssetResponse {
  uploads: PresignVaultAssetDescriptor[];
}

export interface PutCategoryAssignmentsRequest {
  assignments: CategoryAssignmentMap;
}

export interface PutWorkspaceMetaRequest {
  events: HoloEvent[];
  activeEventId: string;
}
